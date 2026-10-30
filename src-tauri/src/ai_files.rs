//! Tools for custom API agents. File access is checked here, not in prompts.
use super::{
    ai_agent::Host,
    ai_tools::Outcome,
    ai_workspace::{Permission, Runtime},
};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use tauri::{AppHandle, Listener};

pub struct FileHost {
    app: AppHandle,
    runtime: Arc<Runtime>,
    vision: bool,
}
impl FileHost {
    pub fn new(app: AppHandle, runtime: Arc<Runtime>, vision: bool) -> Self {
        Self {
            app,
            runtime,
            vision,
        }
    }
}
impl FileHost {
    fn app_tool(&self, scope: &str, name: &str, args: Value) -> Outcome {
        if !["assistant_screenshot", "assistant_start_recording"].contains(&name) {
            return super::ai_tools::execute(&self.app, scope, name, args);
        }
        let completed = Arc::new(std::sync::Mutex::new(Vec::<Value>::new()));
        let target = completed.clone();
        let listener = self.app.listen("native-capture-finished", move |event| {
            if let Ok(v) = serde_json::from_str(event.payload()) {
                if let Ok(mut list) = target.lock() {
                    list.push(v);
                }
            }
        });
        let mut result = super::ai_tools::execute(&self.app, scope, name, args);
        if result.ok && result.data["state"] == "awaiting_user" {
            let start = std::time::Instant::now();
            let id = result.data["operationId"]
                .as_str()
                .unwrap_or_default()
                .to_owned();
            loop {
                if let Err(error) = self.runtime.check() {
                    result = Outcome::error(error);
                    break;
                }
                let done = completed
                    .lock()
                    .ok()
                    .and_then(|list| list.iter().find(|v| v["id"] == id).cloned());
                if let Some(done) = done {
                    let action = done["result"]["action"].as_str().unwrap_or("cancelled");
                    if ["cancelled", "error"].contains(&action) {
                        result = Outcome::error("用户取消了框选或捕获失败".into());
                    } else {
                        result.data = json!({"operationId":id,"state":"completed","message":"用户已完成捕获操作","result":done["result"]});
                    }
                    break;
                }
                if name == "assistant_start_recording" && super::tools::recording_active(&self.app)
                {
                    let status = super::tools::native_capture_status(self.app.clone())
                        .unwrap_or(Value::Null);
                    if status["id"] == id {
                        result.data =
                            json!({"operationId":id,"state":"recording","message":"录屏已开始"});
                        break;
                    }
                }
                if start.elapsed() > std::time::Duration::from_secs(600) {
                    result = Outcome::error("等待用户框选超时".into());
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }
        self.app.unlisten(listener);
        result
    }
}
fn definition(name: &str, description: &str, properties: Value, required: &[&str]) -> Value {
    json!({"type":"function","function":{"name":name,"description":description,"parameters":{"type":"object","properties":properties,"required":required,"additionalProperties":false}}})
}
fn string() -> Value {
    json!({"type":"string"})
}
fn schema(p: &Permission) -> Vec<Value> {
    let mut out=vec![
        definition("agent_list_files","List a directory in the authorized workspace. Never recursively scan the entire machine.",json!({"path":string()}),&["path"]),
        definition("agent_read_file","Read a UTF-8 text file, at most 128 KB. Returns the actual contents for inspection.",json!({"path":string()}),&["path"]),
        definition("agent_search_files","Search text in files within an authorized directory, skipping .git, node_modules, target and symlinks. At most 2000 files, 100 matches.",json!({"path":string(),"text":string()}),&["path","text"]),
    ];
    if p.mode != "read" {
        out.push(definition("agent_write_file","Create a new UTF-8 file or replace an existing one. For an existing file, expectedContent is required and must match the content you read. Parent directory must exist.",json!({"path":string(),"content":string(),"expectedContent":string()}),&["path","content"]));
        out.push(definition("agent_edit_file","Replace exactly one occurrence of oldText in a UTF-8 file. Fails if no match or multiple matches. Read the file first.",json!({"path":string(),"oldText":string(),"newText":string()}),&["path","oldText","newText"]));
        out.push(definition(
            "agent_create_directory",
            "Create one directory under an existing authorized directory.",
            json!({"path":string()}),
            &["path"],
        ));
    }
    if p.commands && p.mode != "read" {
        out.push(definition("agent_run_command","Run a shell command in the authorized workspace and return real exit status and output. This uses the system user and is NOT an OS sandbox. Timeout is at most 120 seconds. Do not launch persistent background services.",json!({"command":string(),"timeoutSeconds":{"type":"integer","minimum":1,"maximum":120}}),&["command"]));
    }
    out
}
pub(super) fn authorized_path(p: &Permission, raw: &str, write: bool) -> Result<PathBuf, String> {
    if raw.is_empty() || raw.len() > 4096 || raw.contains('\0') {
        return Err("文件路径无效".into());
    }
    if write && p.mode == "read" {
        return Err("此联系人只有只读权限".into());
    }
    let path = Path::new(raw);
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("路径不能包含上级目录跳转".into());
    }
    #[cfg(windows)]
    if raw.get(2..).unwrap_or(raw).contains(':') {
        return Err("不支持设备路径或备用数据流".into());
    }
    let base = if p.workspace.trim().is_empty() {
        None
    } else {
        Some(fs::canonicalize(&p.workspace).map_err(|_| "工作目录不存在或不可访问")?)
    };
    let full = if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.as_ref().ok_or("请先给联系人选择工作目录")?.join(path)
    };
    let canonical = if full.exists() {
        fs::canonicalize(&full).map_err(|e| e.to_string())?
    } else {
        let parent = full.parent().ok_or("父目录不存在")?;
        let parent = fs::canonicalize(parent).map_err(|_| "父目录不存在，请先创建目录")?;
        parent.join(full.file_name().ok_or("文件名无效")?)
    };
    if p.mode != "full" {
        let mut roots = vec![];
        if let Some(base) = base {
            roots.push(base);
        }
        for root in &p.extra_dirs {
            roots.push(fs::canonicalize(root).map_err(|_| "额外目录不存在")?);
        }
        if !roots.iter().any(|r| canonical.starts_with(r)) {
            return Err("该路径不在授权目录内".into());
        }
    }
    Ok(canonical)
}
fn arg<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v[key].as_str().ok_or_else(|| format!("缺少参数 {key}"))
}
fn read_text(path: &Path) -> Result<String, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("只能读取普通文本文件".into());
    }
    if meta.len() > 128 * 1024 {
        return Err("文件超过 128 KB，请缩小读取范围".into());
    }
    fs::read_to_string(path).map_err(|_| "无法读取 UTF-8 文本文件".into())
}
fn atomic_write(path: &Path, text: &str) -> Result<(), String> {
    if text.len() > 128 * 1024 {
        return Err("单个文件写入上限为 128 KB".into());
    }
    use std::io::Write;
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("父目录不存在")?)
        .map_err(|e| e.to_string())?;
    temp.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.error.to_string())?;
    Ok(())
}
fn files_tool(p: &Permission, name: &str, args: &Value) -> Result<Value, String> {
    let write = matches!(
        name,
        "agent_write_file" | "agent_edit_file" | "agent_create_directory"
    );
    let path = authorized_path(p, arg(args, "path")?, write)?;
    match name {
        "agent_list_files" => {
            let mut entries = vec![];
            for e in fs::read_dir(&path).map_err(|e| e.to_string())?.take(300) {
                let e = e.map_err(|e| e.to_string())?;
                let kind = e.file_type().map_err(|e| e.to_string())?;
                entries.push(json!({"name":e.file_name().to_string_lossy(),"directory":kind.is_dir(),"symlink":kind.is_symlink()}));
            }
            Ok(json!({"path":path,"entries":entries}))
        }
        "agent_read_file" => Ok(json!({"path":path,"content":read_text(&path)?})),
        "agent_create_directory" => {
            fs::create_dir(&path).map_err(|e| e.to_string())?;
            Ok(json!({"created":path}))
        }
        "agent_write_file" => {
            let text = arg(args, "content")?;
            if path.exists() {
                let old = read_text(&path)?;
                if args["expectedContent"].as_str() != Some(old.as_str()) {
                    return Err("文件已变化或未提供原内容，写入取消，请重新读取".into());
                }
            }
            atomic_write(&path, text)?;
            Ok(json!({"written":path,"bytes":text.len()}))
        }
        "agent_edit_file" => {
            let old = arg(args, "oldText")?;
            if old.is_empty() {
                return Err("oldText 不能为空".into());
            }
            let text = read_text(&path)?;
            if text.matches(old).count() != 1 {
                return Err("待替换文本未找到或存在多处匹配，请重新读取".into());
            }
            let updated = text.replacen(old, arg(args, "newText")?, 1);
            atomic_write(&path, &updated)?;
            Ok(json!({"edited":path}))
        }
        "agent_search_files" => {
            let needle = arg(args, "text")?;
            if needle.is_empty() || needle.len() > 1000 {
                return Err("搜索内容为空或过长".into());
            }
            let mut pending = vec![path];
            let mut scanned = 0;
            let mut matches = vec![];
            while let Some(dir) = pending.pop() {
                for entry in fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
                    if scanned >= 2000 || matches.len() >= 100 {
                        break;
                    }
                    scanned += 1;
                    let ty = match entry.file_type() {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    if ty.is_symlink() {
                        continue;
                    }
                    let path = entry.path();
                    if ty.is_dir() {
                        if ![".git", "node_modules", "target", "dist"]
                            .contains(&entry.file_name().to_string_lossy().as_ref())
                        {
                            pending.push(path);
                        }
                        continue;
                    }
                    if let Ok(text) = read_text(&path) {
                        for (i, line) in text.lines().enumerate() {
                            if line.contains(needle) {
                                matches.push(json!({"path":path,"line":i+1,"text":super::ai_workspace::truncate(line,600)}));
                                if matches.len() >= 100 {
                                    break;
                                }
                            }
                        }
                    }
                }
                if scanned >= 2000 || matches.len() >= 100 {
                    break;
                }
            }
            Ok(
                json!({"matches":matches,"scanned":scanned,"limited":scanned>=2000||matches.len()>=100}),
            )
        }
        _ => Err("未知文件工具".into()),
    }
}
impl Host for FileHost {
    fn definitions(&self) -> Vec<Value> {
        let mut out = schema(&self.runtime.permission);
        if self.runtime.permission.desktop && self.runtime.permission.mode == "full" && self.vision
        {
            out.extend(super::ai_desktop::definitions());
        }
        if self.runtime.permission.app_tools {
            out.extend(
                super::ai_tools::definitions(&self.app)
                    .into_iter()
                    .filter(|d| {
                        self.runtime.permission.mode != "read"
                            || d["function"]["name"] == "assistant_recording_status"
                    }),
            );
            out.push(definition(
                "agent_list_launchers",
                "List project and application entries for the current computer.",
                json!({}),
                &[],
            ));
            if self.runtime.permission.mode != "read" {
                out.push(definition(
                    "agent_open_launcher",
                    "Open an explicitly requested saved application or project by its ID.",
                    json!({"id":{"type":"integer"}}),
                    &["id"],
                ));
            }
        }
        out
    }
    fn execute(&self, scope: &str, name: &str, args: Value) -> Outcome {
        let result = (|| {
            self.runtime.check()?;
            if !self
                .definitions()
                .iter()
                .any(|d| d["function"]["name"] == name)
            {
                return Err("该工具未获此联系人授权".into());
            }
            let mutation = !matches!(
                name,
                "agent_list_files"
                    | "agent_read_file"
                    | "agent_search_files"
                    | "agent_list_launchers"
                    | "assistant_recording_status"
            );
            if mutation {
                self.runtime.approve(name, &args)?;
            }
            self.runtime.check()?;
            if name.starts_with("assistant_") {
                return Ok(self.app_tool(scope, name, args.clone()));
            }
            let perform = || -> Result<Value, String> {
                if name.starts_with("agent_desktop_") {
                    return super::ai_desktop::execute(name, &args);
                }
                if name == "agent_run_command" {
                    let dir = authorized_path(&self.runtime.permission, ".", false)?;
                    return super::ai_cli::shell_command(
                        arg(&args, "command")?,
                        &dir,
                        args["timeoutSeconds"].as_u64().unwrap_or(60).clamp(1, 120),
                        self.runtime.clone(),
                    );
                }
                if name == "agent_list_launchers" {
                    let conn = super::db(&self.app)?;
                    let mut s=conn.prepare("SELECT id,name,kind FROM launchers WHERE deleted_at IS NULL AND computer_id=(SELECT computer_id FROM local_binding LIMIT 1)").map_err(|e|e.to_string())?;
                    let entries=s.query_map([],|r|Ok(json!({"id":r.get::<_,i64>(0)?,"name":r.get::<_,String>(1)?,"kind":r.get::<_,String>(2)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
                    return Ok(json!({"entries":entries}));
                }
                if name == "agent_open_launcher" {
                    super::launch_entry(
                        self.app.clone(),
                        args["id"].as_i64().ok_or("入口编号无效")?,
                    )?;
                    return Ok(json!({"opened":true}));
                }
                files_tool(&self.runtime.permission, name, &args)
            };
            if mutation && name != "agent_run_command" && !name.starts_with("agent_desktop_") {
                super::ai_tools::execute_once(
                    &mut super::db(&self.app)?,
                    scope,
                    name,
                    &args,
                    perform,
                )
            } else {
                let data = perform()?;
                Ok(Outcome {
                    ok: true,
                    data,
                    error: None,
                    reused: false,
                })
            }
        })();
        result.unwrap_or_else(Outcome::error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn permission(dir: &Path) -> Permission {
        Permission {
            mode: "workspace".into(),
            workspace: dir.to_string_lossy().into(),
            ..Permission::default()
        }
    }
    #[test]
    fn restricts_traversal_absolute_escape_and_readonly() {
        let root = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let mut p = permission(root.path());
        assert!(authorized_path(&p, "../outside", true).is_err());
        assert!(authorized_path(&p, &other.path().join("x").to_string_lossy(), true).is_err());
        assert!(authorized_path(&p, "new.rs", true).is_ok());
        p.mode = "read".into();
        assert!(authorized_path(&p, "new.rs", true).is_err());
    }
    #[test]
    fn prevents_stale_overwrites_and_ambiguous_edits() {
        let dir = tempfile::tempdir().unwrap();
        let p = permission(dir.path());
        files_tool(
            &p,
            "agent_write_file",
            &json!({"path":"a.txt","content":"hello hello"}),
        )
        .unwrap();
        assert!(files_tool(
            &p,
            "agent_write_file",
            &json!({"path":"a.txt","content":"erase"})
        )
        .is_err());
        assert!(files_tool(
            &p,
            "agent_edit_file",
            &json!({"path":"a.txt","oldText":"hello","newText":"x"})
        )
        .is_err());
        files_tool(
            &p,
            "agent_write_file",
            &json!({"path":"a.txt","content":"new","expectedContent":"hello hello"}),
        )
        .unwrap();
        assert_eq!(fs::read_to_string(dir.path().join("a.txt")).unwrap(), "new");
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let dir = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(other.path(), dir.path().join("escape")).unwrap();
        assert!(authorized_path(&permission(dir.path()), "escape/a.txt", true).is_err());
    }
}
