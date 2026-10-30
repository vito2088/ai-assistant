//! Local CLI adapters. Prompts travel through stdin, never through shell strings.
use super::ai_workspace::{truncate, Contact, Runtime};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{mpsc, Arc},
    time::{Duration, Instant},
};
use tauri::ipc::Channel;

fn hidden(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
}
fn candidates(name: &str) -> Vec<PathBuf> {
    let mut dirs = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect::<Vec<_>>())
        .unwrap_or_default();
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        let home = PathBuf::from(home);
        dirs.extend([home.join(".local/bin"), home.join(".cargo/bin")]);
    }
    #[cfg(windows)]
    {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            dirs.push(PathBuf::from(local).join("Programs/OpenAI/Codex/bin"));
        }
        if let Some(roaming) = std::env::var_os("APPDATA") {
            dirs.push(PathBuf::from(roaming).join("npm"));
        }
    }
    let mut out = vec![];
    for dir in dirs {
        #[cfg(windows)]
        for ext in ["exe", "cmd", "ps1"] {
            out.push(dir.join(format!("{name}.{ext}")));
        }
        #[cfg(not(windows))]
        out.push(dir.join(name));
    }
    out
}
fn resolve(kind: &str, custom: &str) -> Result<PathBuf, String> {
    if !["codex", "claude"].contains(&kind) {
        return Err("不支持的命令行执行端".into());
    }
    let path = if custom.trim().is_empty() {
        candidates(kind)
            .into_iter()
            .find(|p| p.is_file())
            .ok_or_else(|| format!("未安装或未找到 {kind}，请安装或指定程序路径"))?
    } else {
        let p = PathBuf::from(custom);
        if !p.is_absolute() || !p.is_file() {
            return Err("程序路径不存在或不是绝对路径".into());
        }
        p
    };
    std::fs::canonicalize(path).map_err(|e| e.to_string())
}
pub(super) fn native_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let raw = path.to_string_lossy();
        if let Some(rest) = raw.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        if let Some(rest) = raw.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    path.to_path_buf()
}
fn prepare(path: &Path, args: &[String]) -> Result<Command, String> {
    #[cfg(windows)]
    {
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if ext == "cmd" || ext == "bat" {
            // npm wrappers add a second command-line parser. Invoke their known
            // native/JS entry directly so MCP TOML/JSON arguments stay intact.
            if let Some(dir) = path.parent() {
                let name = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default();
                if name == "claude" {
                    let native = dir.join("node_modules/@anthropic-ai/claude-code/bin/claude.exe");
                    if native.is_file() {
                        let mut c = Command::new(native_path(&native));
                        c.args(args);
                        return Ok(c);
                    }
                }
                let entry = match name {
                    "codex" => Some("node_modules/@openai/codex/bin/codex.js"),
                    "claude" => Some("node_modules/@anthropic-ai/claude-code/cli.js"),
                    _ => None,
                };
                if let Some(entry) = entry.map(|p| dir.join(p)).filter(|p| p.is_file()) {
                    let node = dir.join("node.exe");
                    let mut c = Command::new(if node.is_file() {
                        native_path(&node)
                    } else {
                        PathBuf::from("node.exe")
                    });
                    c.arg(native_path(&entry)).args(args);
                    return Ok(c);
                }
            }
            let quote = |s: &str| -> Result<String, String> {
                if s.contains(['"', '%', '!', '\r', '\n', '\0']) {
                    return Err("命令行入口或参数包含不支持的字符，请选择原生可执行文件".into());
                }
                Ok(format!("\"{s}\""))
            };
            let raw = path.to_string_lossy();
            let raw = if let Some(rest) = raw.strip_prefix(r"\\?\UNC\") {
                format!(r"\\{rest}")
            } else {
                raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_owned()
            };
            let mut parts = vec![quote(&raw)?];
            for a in args {
                parts.push(quote(a)?);
            }
            let mut c = Command::new("cmd.exe");
            c.args(["/d", "/v:off", "/s", "/c"]);
            use std::os::windows::process::CommandExt;
            c.raw_arg(format!("\"{}\"", parts.join(" ")));
            return Ok(c);
        }
        if ext == "ps1" {
            let mut c = Command::new("powershell.exe");
            c.args(["-NoProfile", "-File"])
                .arg(native_path(path))
                .args(args);
            return Ok(c);
        }
        if ext != "exe" {
            return Err("请选择 exe、cmd 或 ps1 命令行入口".into());
        }
    }
    let mut c = Command::new(path);
    c.args(args);
    Ok(c)
}

#[cfg(windows)]
struct Job(windows::Win32::Foundation::HANDLE);
#[cfg(windows)]
impl Job {
    fn attach(child: &std::process::Child) -> Result<Self, String> {
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::{Foundation::HANDLE, System::JobObjects::*};
        unsafe {
            let handle = CreateJobObjectW(None, None).map_err(|e| e.to_string())?;
            let job = Self(handle);
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                std::mem::size_of_val(&limits) as u32,
            )
            .map_err(|e| e.to_string())?;
            AssignProcessToJobObject(handle, HANDLE(child.as_raw_handle()))
                .map_err(|e| e.to_string())?;
            Ok(job)
        }
    }
}
#[cfg(windows)]
impl Drop for Job {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

struct ProcessResult {
    status: std::process::ExitStatus,
    stdout: String,
    stderr: String,
}
// Shared process cleanup for the terminal's explicitly approved, non-interactive AI jobs.
pub(super) fn terminal_command(command: Command, cancel: impl Fn() -> bool) -> Result<Value, String> {
    let result = collect(command, "", Duration::from_secs(60), cancel, |_| {})?;
    Ok(json!({"exitCode":result.status.code(),"stdout":truncate(&result.stdout,32768),"stderr":truncate(&result.stderr,32768),"truncated":result.stdout.len()>32768||result.stderr.len()>32768}))
}
fn collect(
    mut command: Command,
    input: &str,
    timeout: Duration,
    cancel: impl Fn() -> bool,
    on_line: impl Fn(&str),
) -> Result<ProcessResult, String> {
    hidden(&mut command);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| format!("无法启动执行端：{e}"))?;
    #[cfg(windows)]
    let job = match Job::attach(&child) {
        Ok(job) => job,
        Err(e) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("无法建立进程清理边界：{e}"));
        }
    };
    let stdout = child.stdout.take().ok_or("无法读取执行结果")?;
    let stderr = child.stderr.take().ok_or("无法读取执行错误")?;
    let stdin = child.stdin.take().ok_or("无法写入任务")?;
    let input = input.to_owned();
    let writer = std::thread::spawn(move || {
        let mut s = stdin;
        let _ = s.write_all(input.as_bytes());
    });
    let (tx, rx) = mpsc::sync_channel::<(bool, String)>(64);
    let out_tx = tx.clone();
    let out_reader = std::thread::spawn(move || {
        let mut r = BufReader::new(stdout);
        loop {
            let mut bytes = vec![];
            let n = (&mut r)
                .take(1024 * 1024)
                .read_until(b'\n', &mut bytes)
                .unwrap_or(0);
            if n == 0 {
                break;
            }
            if out_tx
                .send((true, String::from_utf8_lossy(&bytes).into_owned()))
                .is_err()
            {
                break;
            }
        }
    });
    let err_reader = std::thread::spawn(move || {
        let mut r = BufReader::new(stderr);
        loop {
            let mut bytes = vec![];
            let n = (&mut r)
                .take(64 * 1024)
                .read_until(b'\n', &mut bytes)
                .unwrap_or(0);
            if n == 0 {
                break;
            }
            if tx
                .send((false, String::from_utf8_lossy(&bytes).into_owned()))
                .is_err()
            {
                break;
            }
        }
    });
    let mut output = String::new();
    let mut errors = String::new();
    let start = Instant::now();
    let mut stopped = false;
    let mut too_large = false;
    let mut exit = None;
    loop {
        match rx.recv_timeout(Duration::from_millis(60)) {
            Ok((out, line)) => {
                let dest = if out { &mut output } else { &mut errors };
                if dest.len() + line.len() > 2 * 1024 * 1024 {
                    too_large = true;
                } else {
                    dest.push_str(&line);
                    if out {
                        on_line(&line);
                    }
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                if exit.is_some() {
                    break;
                }
            }
            Err(_) => {}
        }
        if exit.is_none() {
            exit = child.try_wait().map_err(|e| e.to_string())?;
        }
        if cancel() || start.elapsed() > timeout || too_large {
            stopped = true;
            break;
        }
        if exit.is_some() && out_reader.is_finished() && err_reader.is_finished() {
            while let Ok((out, line)) = rx.try_recv() {
                let dest = if out { &mut output } else { &mut errors };
                if dest.len() + line.len() <= 2 * 1024 * 1024 {
                    dest.push_str(&line);
                    if out {
                        on_line(&line);
                    }
                }
            }
            break;
        }
        if exit.is_some() && start.elapsed() > timeout {
            break;
        }
    }
    if stopped {
        let _ = child.kill();
    }
    #[cfg(unix)]
    {
        unsafe extern "C" {
            fn kill(pid: i32, sig: i32) -> i32;
        }
        unsafe {
            kill(-(child.id() as i32), 15);
        }
    }
    #[cfg(windows)]
    drop(job);
    drop(rx);
    let _ = writer.join();
    let _ = out_reader.join();
    let _ = err_reader.join();
    let status = child.wait().map_err(|e| e.to_string())?;
    if stopped {
        return Err(if cancel() {
            "任务已停止".into()
        } else if too_large {
            "执行输出超过限制".into()
        } else {
            "执行超时，已终止进程及子进程".into()
        });
    }
    Ok(ProcessResult {
        status,
        stdout: output,
        stderr: errors,
    })
}
#[tauri::command]
pub async fn ai_cli_detect(kind: String, executable: Option<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move||{
        let path=match resolve(&kind,executable.as_deref().unwrap_or_default()){Ok(path)=>path,Err(e)=>return Ok(json!({"kind":kind,"installed":false,"error":e}))};
        let result=collect(prepare(&path,&["--version".into()])?,"",Duration::from_secs(15),||false,|_|{})?;
        Ok::<_,String>(json!({"kind":kind,"installed":result.status.success(),"path":path,"version":truncate(result.stdout.trim(),200),"error":if result.status.success(){Value::Null}else{json!(truncate(&result.stderr,1000))}}))
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn ai_cli_install(kind: String, on_event: Channel<Value>) -> Result<Value, String> {
    if !["codex", "claude"].contains(&kind.as_str()) {
        return Err("未知安装类型".into());
    }
    tauri::async_runtime::spawn_blocking(move||{
        if let Ok(path)=resolve(&kind,""){return Ok(json!({"installed":true,"path":path,"alreadyInstalled":true}));}
        let mut command=if kind=="codex"{
            let npm=candidates("npm").into_iter().find(|p|p.is_file()).ok_or("Codex 的此安装方式需要 Node.js/npm，请先安装 Node.js 或手动安装 Codex 后重新检测")?;
            prepare(&npm,&["install".into(),"-g".into(),"@openai/codex".into()])?
        }else{
            #[cfg(windows)]let c={let mut c=Command::new("powershell.exe");c.args(["-NoProfile","-Command","& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing 'https://claude.ai/install.ps1').Content))"]);c};
            #[cfg(not(windows))]let c={let mut c=Command::new("sh");c.args(["-c","curl -fsSL https://claude.ai/install.sh | bash"]);c};c
        };
        command.current_dir(std::env::temp_dir());
        let result=collect(command,"",Duration::from_secs(600),||false,|s|{let _=on_event.send(json!({"type":"install","text":truncate(s,2000)}));})?;
        if !result.status.success(){return Err(format!("安装失败：{}",truncate(&result.stderr,3000)));}
        let path=resolve(&kind,"")?;Ok(json!({"installed":true,"path":path}))
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub fn ai_cli_open(kind: String, executable: Option<String>) -> Result<(), String> {
    let path = native_path(&resolve(&kind, executable.as_deref().unwrap_or_default())?);
    #[cfg(windows)]
    {
        use windows::{
            core::PCWSTR,
            Win32::{
                Foundation::HWND,
                UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
            },
        };
        let file = path
            .as_os_str()
            .to_string_lossy()
            .encode_utf16()
            .chain(Some(0))
            .collect::<Vec<_>>();
        let verb = "open\0".encode_utf16().collect::<Vec<_>>();
        let result = unsafe {
            ShellExecuteW(
                Some(HWND::default()),
                PCWSTR(verb.as_ptr()),
                PCWSTR(file.as_ptr()),
                None,
                None,
                SW_SHOWNORMAL,
            )
        };
        if result.0 as isize <= 32 {
            return Err("打开终端失败，请在终端手动运行对应命令".into());
        }
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Terminal"])
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        Command::new("x-terminal-emulator")
            .arg("-e")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub async fn run(
    app: tauri::AppHandle,
    c: Contact,
    prompt: String,
    session: Option<String>,
    runtime: Arc<Runtime>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move||{
        runtime.approve("启动本机 AI 任务",&json!({"engine":c.kind,"workspace":c.permission.workspace,"permission":c.permission.mode,"task":truncate(&prompt,1500)}))?;
        let path=resolve(&c.kind,&c.executable)?;let mut args=vec![];
        let session=session.filter(|s|!s.is_empty()&&s.len()<120&&s.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'));
        if c.kind=="codex"{
            args.extend(["exec".into()]);if let Some(s)=session{args.extend(["resume".into(),s]);}args.extend(["--json".into(),"--skip-git-repo-check".into()]);
            if c.permission.mode!="inherit"{args.extend(["-c".into(),format!("sandbox_mode='{}'",match c.permission.mode.as_str(){"read"=>"read-only","full"=>"danger-full-access",_=>"workspace-write"})]);}
            if c.permission.mode=="full"&&!c.permission.ask{args.push("--dangerously-bypass-approvals-and-sandbox".into());}args.push("-".into());
        }else{
            args.extend(["-p".into(),"--output-format".into(),"stream-json".into(),"--verbose".into()]);if let Some(s)=session{args.extend(["--resume".into(),s]);}
            match c.permission.mode.as_str(){"read"=>args.extend(["--permission-mode".into(),"plan".into(),"--disallowedTools".into(),"Edit,Write,NotebookEdit,Bash,PowerShell".into()]),"workspace"=>args.extend(["--permission-mode".into(),"acceptEdits".into()]),"full" if !c.permission.ask=>args.push("--dangerously-skip-permissions".into()),_=>{}}
        }
        let mut bridge=if c.permission.app_tools||c.permission.desktop {Some(super::ai_bridge::Bridge::start(app,runtime.clone())?)}else{None};
        if let Some(bridge)=bridge.as_mut(){bridge.configure(&c.kind,&mut args)?;}
        let mut command=prepare(&path,&args)?;
        if let Some(bridge)=bridge.as_ref(){bridge.environment(&mut command);}
        if !c.permission.workspace.is_empty(){let dir=std::fs::canonicalize(&c.permission.workspace).map_err(|_|"工作目录不存在")?;if !dir.is_dir(){return Err("工作目录不是文件夹".into());}command.current_dir(native_path(&dir));}
        let state=MutexState::default();
        let result=collect(command,&prompt,Duration::from_secs(1800),||runtime.check().is_err(),|line|{
            let Ok(value)=serde_json::from_str::<Value>(line)else{return;};
            let mut state=state.0.lock().unwrap();parse_event(&c.kind,&value,&mut state,&runtime);
        })?;
        let state=state.0.into_inner().map_err(|_|"执行结果不可用")?;
        if !result.status.success()||state.failed||!state.complete {return Err(format!("执行未成功完成：{}",truncate(&format!("{} {}",state.error,result.stderr),4000)));}
        Ok(json!({"text":state.text,"sessionId":state.session,"workspace":c.permission.workspace}))
    }).await.map_err(|e|e.to_string())?
}
#[derive(Default)]
struct CliState {
    text: String,
    session: Option<String>,
    complete: bool,
    failed: bool,
    error: String,
}
#[derive(Default)]
struct MutexState(std::sync::Mutex<CliState>);
fn parse_event(kind: &str, v: &Value, s: &mut CliState, r: &Runtime) {
    let ty = v["type"].as_str().unwrap_or_default();
    if kind == "codex" {
        if ty == "thread.started" {
            s.session = v["thread_id"].as_str().map(str::to_owned);
        }
        if ty == "turn.completed" {
            s.complete = true;
        }
        if ty == "turn.failed" || ty == "error" {
            s.failed = true;
            s.error = v["error"]["message"]
                .as_str()
                .or(v["message"].as_str())
                .unwrap_or("执行失败")
                .into();
        }
        if ty == "item.completed" && v["item"]["type"] == "agent_message" {
            if let Some(text) = v["item"]["text"].as_str() {
                s.text.push_str(text);
                s.text.push('\n');
                r.emit(json!({"type":"text","text":format!("{text}\n")}));
            }
        } else if ty.starts_with("item.") && v["item"]["type"] != "reasoning" {
            r.emit(json!({"type":"activity","text":truncate(&v["item"].to_string(),6000)}));
        }
    } else {
        if ty == "system" {
            if let Some(id) = v["session_id"].as_str() {
                s.session = Some(id.into());
            }
        }
        if ty == "assistant" {
            if let Some(content) = v["message"]["content"].as_array() {
                for block in content {
                    if let Some(text) = block["text"].as_str() {
                        s.text.push_str(text);
                        s.text.push('\n');
                        r.emit(json!({"type":"text","text":format!("{text}\n")}));
                    } else if block["type"] == "tool_use" || block["type"] == "tool_result" {
                        r.emit(json!({"type":"activity","text":truncate(&block.to_string(),6000)}));
                    }
                }
            }
        }
        if ty == "result" {
            s.complete = true;
            s.failed = v["is_error"].as_bool().unwrap_or(false);
            if let Some(text) = v["result"].as_str() {
                s.text = text.into();
                if s.failed {
                    s.error = text.into();
                }
            }
            if let Some(id) = v["session_id"].as_str() {
                s.session = Some(id.into());
            }
            if s.failed && s.error.is_empty() {
                s.error = truncate(&v.to_string(), 3000).into();
            }
        }
    }
}
pub fn shell_command(
    text: &str,
    dir: &Path,
    timeout: u64,
    runtime: Arc<Runtime>,
) -> Result<Value, String> {
    if text.is_empty() || text.len() > 16000 || text.contains('\0') {
        return Err("命令为空或过长".into());
    }
    #[cfg(windows)]
    let mut command = {
        let mut c = Command::new("powershell.exe");
        c.args(["-NoProfile", "-NonInteractive", "-Command"]);
        c.arg(format!("[Console]::OutputEncoding=[Text.UTF8Encoding]::new();$OutputEncoding=[Text.UTF8Encoding]::new();{text}"));
        c
    };
    #[cfg(not(windows))]
    let mut command = {
        let mut c = Command::new("sh");
        c.args(["-c", text]);
        c
    };
    command.current_dir(native_path(dir));
    let result = collect(
        command,
        "",
        Duration::from_secs(timeout),
        || runtime.check().is_err(),
        |line| runtime.emit(json!({"type":"activity","text":truncate(line,1500)})),
    )?;
    Ok(
        json!({"exitCode":result.status.code(),"success":result.status.success(),"stdout":truncate(&result.stdout,24000),"stderr":truncate(&result.stderr,8000)}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn canonical_powershell_wrapper_runs_with_spaces_without_policy_bypass() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("qa cli.ps1");
        std::fs::write(&path, "Write-Output 'QA_WRAPPER_OK'\n").unwrap();
        let result = collect(
            prepare(&std::fs::canonicalize(path).unwrap(), &[]).unwrap(),
            "",
            Duration::from_secs(10),
            || false,
            |_| {},
        )
        .unwrap();
        assert!(result.status.success(), "{}", result.stderr);
        assert!(result.stdout.contains("QA_WRAPPER_OK"));
    }
    #[test]
    fn rejects_unknown_engines_and_missing_paths() {
        assert!(resolve("unknown", "").is_err());
        assert!(resolve("codex", "missing-relative.exe").is_err());
    }
    #[test]
    fn process_reports_real_failure_and_limits_time() {
        #[cfg(windows)]
        let mut c = {
            let mut c = Command::new("cmd.exe");
            c.args(["/d", "/c", "exit 7"]);
            c
        };
        #[cfg(not(windows))]
        let mut c = {
            let mut c = Command::new("sh");
            c.args(["-c", "exit 7"]);
            c
        };
        c.current_dir(std::env::temp_dir());
        let r = collect(c, "", Duration::from_secs(5), || false, |_| {}).unwrap();
        assert_eq!(r.status.code(), Some(7));
    }
    #[test]
    fn installed_wrappers_support_version_probes_without_model_requests() {
        for kind in ["codex", "claude"] {
            if let Ok(path) = resolve(kind, "") {
                let result = collect(
                    prepare(&path, &["--version".into()]).unwrap(),
                    "",
                    Duration::from_secs(20),
                    || false,
                    |_| {},
                )
                .unwrap();
                assert!(
                    result.status.success(),
                    "{kind}: {} {}",
                    result.stdout,
                    result.stderr
                );
                assert!(!result.stdout.trim().is_empty());
            }
        }
    }
    #[test]
    fn completion_protocol_does_not_confuse_failure_with_success() {
        let runtime = Runtime::test(Default::default());
        let mut state = CliState::default();
        parse_event(
            "codex",
            &json!({"type":"thread.started","thread_id":"id"}),
            &mut state,
            &runtime,
        );
        parse_event(
            "codex",
            &json!({"type":"turn.failed","error":{"message":"denied"}}),
            &mut state,
            &runtime,
        );
        assert!(state.failed);
        assert!(!state.complete);
        assert_eq!(state.session.as_deref(), Some("id"));
        let mut state = CliState::default();
        parse_event(
            "claude",
            &json!({"type":"result","is_error":true,"result":"not authorized","session_id":"session"}),
            &mut state,
            &runtime,
        );
        assert!(state.failed && state.complete);
        assert_eq!(state.error, "not authorized");
    }
    #[test]
    fn cancellation_terminates_long_running_process() {
        let start = Instant::now();
        #[cfg(windows)]
        let mut c = {
            let mut c = Command::new("powershell.exe");
            c.args(["-NoProfile", "-Command", "Start-Sleep -Seconds 30"]);
            c
        };
        #[cfg(not(windows))]
        let mut c = {
            let mut c = Command::new("sh");
            c.args(["-c", "sleep 30"]);
            c
        };
        c.current_dir(std::env::temp_dir());
        assert!(collect(
            c,
            "",
            Duration::from_secs(30),
            || start.elapsed() > Duration::from_millis(300),
            |_| {}
        )
        .is_err());
        assert!(start.elapsed() < Duration::from_secs(5));
    }
}
