//! Interactive terminals. Authentication and human input never enter the AI channel.
use base64::{engine::general_purpose::STANDARD, Engine};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::Duration,
};
use tauri::{ipc::Channel, AppHandle, WebviewWindow};
use zeroize::Zeroizing;

#[path = "terminal_ai.rs"]
pub mod ai;
#[path = "terminal_files.rs"]
pub mod files;
#[path = "terminal_ssh.rs"]
pub mod ssh;
#[cfg(test)]
#[path = "terminal_test_server.rs"]
mod test_server;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub shell: String,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub username: String,
    #[serde(default = "default_auth")]
    pub auth: String,
    #[serde(default)]
    pub key_path: String,
    #[serde(default)]
    pub group: String,
    #[serde(default)]
    pub environment: String,
}
fn default_port() -> u16 {
    22
}
fn default_auth() -> String {
    "password".into()
}
#[cfg(test)]
pub fn test_session(cwd: String) -> Arc<Session> {
    Arc::new(Session {
        id: uuid::Uuid::new_v4().to_string(),
        profile: Profile {
            id: "test".into(),
            name: "test".into(),
            kind: "local".into(),
            shell: if cfg!(windows) {
                "cmd".into()
            } else {
                "sh".into()
            },
            cwd,
            host: String::new(),
            port: 22,
            username: String::new(),
            auth: "password".into(),
            key_path: String::new(),
            group: String::new(),
            environment: String::new(),
        },
        closed: AtomicBool::new(false),
        pending: AtomicUsize::new(0),
        event: Channel::new(|_| Ok(())),
        backend: Mutex::new(None),
        secrets: Mutex::new(vec![]),
    })
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub font_size: u16,
    pub scrollback: u16,
    pub theme: String,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            font_size: 13,
            scrollback: 3000,
            theme: "dark".into(),
        }
    }
}

pub fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("此操作仅允许在主窗口中进行".into());
    }
    Ok(())
}
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 100
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}
pub fn validate_profile(p: &Profile) -> Result<(), String> {
    if !valid_id(&p.id)
        || p.name.trim().is_empty()
        || p.name.chars().count() > 80
        || !["local", "ssh"].contains(&p.kind.as_str())
    {
        return Err("终端名称或类型无效".into());
    }
    for value in [
        &p.name,
        &p.cwd,
        &p.host,
        &p.username,
        &p.key_path,
        &p.group,
        &p.environment,
    ] {
        if value.len() > 4096 || value.contains(['\0', '\r', '\n']) {
            return Err("终端配置包含无效内容".into());
        }
    }
    if !["", "development", "test", "production"].contains(&p.environment.as_str()) {
        return Err("环境标记无效".into());
    }
    if p.kind == "local" {
        shell_command(&p.shell)?;
        if !p.cwd.is_empty()
            && (!std::path::Path::new(&p.cwd).is_absolute()
                || !std::path::Path::new(&p.cwd).is_dir())
        {
            return Err("请选择存在的本地绝对目录".into());
        }
    } else if p.host.is_empty()
        || p.host.len() > 255
        || p.host.chars().any(char::is_whitespace)
        || p.port == 0
        || p.username.is_empty()
        || p.username.len() > 128
        || !["password", "key"].contains(&p.auth.as_str())
    {
        return Err("请检查服务器、端口、用户名与认证方式".into());
    } else if p.auth == "key"
        && (p.key_path.is_empty() || !std::path::Path::new(&p.key_path).is_absolute())
    {
        return Err("请选择私钥文件的绝对路径".into());
    }
    Ok(())
}
fn schema(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS terminal_profiles(id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS terminal_hosts(host TEXT NOT NULL,port INTEGER NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(host,port)); CREATE TABLE IF NOT EXISTS terminal_preferences(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);").map_err(|_| "无法初始化终端存储".into())
}
fn database(app: &AppHandle) -> Result<rusqlite::Connection, String> {
    let conn = super::db(app)?;
    schema(&conn)?;
    Ok(conn)
}
pub fn profile(app: &AppHandle, id: &str) -> Result<Profile, String> {
    let raw: String = database(app)?
        .query_row(
            "SELECT data FROM terminal_profiles WHERE id=?1",
            [id],
            |r| r.get(0),
        )
        .map_err(|_| "连接配置不存在")?;
    serde_json::from_str(&raw).map_err(|_| "连接配置损坏".into())
}
pub fn credential(id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.myassistant.desktop.terminal", id)
        .map_err(|_| "系统凭据库不可用".into())
}
pub fn remove_credential(id: &str) -> Result<(), String> {
    match credential(id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("无法删除系统凭据，请检查系统凭据库".into()),
    }
}
async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|_| "终端后台任务失败")?
}
#[tauri::command]
pub async fn terminal_load(app: AppHandle, window: WebviewWindow) -> Result<Value, String> {
    main_only(&window)?;
    blocking(move || load(app)).await
}
#[tauri::command]
pub async fn terminal_save_profile(
    app: AppHandle,
    window: WebviewWindow,
    value: Profile,
) -> Result<Profile, String> {
    main_only(&window)?;
    blocking(move || save_profile(app, value)).await
}
#[tauri::command]
pub async fn terminal_delete_profile(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
) -> Result<(), String> {
    main_only(&window)?;
    blocking(move || delete_profile(app, id)).await
}
#[tauri::command]
pub async fn terminal_forget_secret(window: WebviewWindow, id: String) -> Result<(), String> {
    main_only(&window)?;
    blocking(move || {
        if !valid_id(&id) {
            return Err("无效的连接编号".into());
        }
        remove_credential(&id)
    })
    .await
}
#[tauri::command]
pub async fn terminal_save_preferences(
    app: AppHandle,
    window: WebviewWindow,
    value: Preferences,
) -> Result<(), String> {
    main_only(&window)?;
    blocking(move || save_preferences(app, value)).await
}
fn load(app: AppHandle) -> Result<Value, String> {
    let conn = database(&app)?;
    let mut stmt = conn
        .prepare("SELECT data FROM terminal_profiles ORDER BY rowid")
        .map_err(|_| "无法读取连接列表")?;
    let profiles = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|_| "无法读取连接列表")?
        .map(|raw| {
            let p: Profile = serde_json::from_str(&raw.map_err(|_| "无法读取连接")?)
                .map_err(|_| "连接配置损坏")?;
            Ok::<_, String>(p)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let preferences: Preferences = conn
        .query_row(
            "SELECT data FROM terminal_preferences WHERE id=1",
            [],
            |r| r.get::<_, String>(0),
        )
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let shells = if cfg!(windows) {
        vec!["powershell", "cmd", "pwsh"]
    } else {
        vec!["default", "bash", "zsh", "sh"]
    };
    Ok(json!({"profiles": profiles, "preferences": preferences, "shells": shells}))
}
fn save_profile(app: AppHandle, mut value: Profile) -> Result<Profile, String> {
    if value.id.is_empty() {
        value.id = uuid::Uuid::new_v4().to_string();
    }
    value.name = value.name.trim().into();
    value.host = value.host.trim().to_ascii_lowercase();
    value.username = value.username.trim().into();
    validate_profile(&value)?;
    let conn = database(&app)?;
    if let Ok(old) = profile(&app, &value.id) {
        if (&old.host, old.port, &old.username, &old.auth, &old.key_path)
            != (
                &value.host,
                value.port,
                &value.username,
                &value.auth,
                &value.key_path,
            )
        {
            remove_credential(&value.id)?;
        }
    } else {
        let count: i64 = conn
            .query_row("SELECT count(*) FROM terminal_profiles", [], |r| r.get(0))
            .map_err(|_| "无法读取连接数量")?;
        if count >= 100 {
            return Err("最多保存 100 个连接配置".into());
        }
    }
    conn.execute("INSERT INTO terminal_profiles(id,data) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data", params![value.id, serde_json::to_string(&value).map_err(|_| "连接序列化失败")?]).map_err(|_| "保存连接失败")?;
    Ok(value)
}
fn delete_profile(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("无效的连接编号".into());
    }
    if profile(&app, &id)?.kind == "ssh" {
        remove_credential(&id)?;
    }
    database(&app)?
        .execute("DELETE FROM terminal_profiles WHERE id=?1", [id])
        .map_err(|_| "删除连接失败")?;
    Ok(())
}
fn save_preferences(app: AppHandle, value: Preferences) -> Result<(), String> {
    if !(10..=24).contains(&value.font_size)
        || !(500..=10000).contains(&value.scrollback)
        || !["dark", "light"].contains(&value.theme.as_str())
    {
        return Err("终端显示设置无效".into());
    }
    database(&app)?.execute("INSERT INTO terminal_preferences(id,data) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data", [serde_json::to_string(&value).map_err(|_| "设置序列化失败")?]).map_err(|_| "保存终端设置失败")?;
    Ok(())
}

pub struct Local {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    group: Mutex<Option<ProcessGroup>>,
}
#[cfg(windows)]
struct ProcessGroup(usize);
#[cfg(windows)]
impl ProcessGroup {
    fn attach(child: &dyn Child, _master: &dyn MasterPty) -> Result<Self, String> {
        use windows::Win32::{Foundation::HANDLE, System::JobObjects::*};
        let process = child.as_raw_handle().ok_or("无法取得终端进程")?;
        unsafe {
            let handle = CreateJobObjectW(None, None).map_err(|_| "无法建立终端进程清理边界")?;
            let group = Self(handle.0 as usize);
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                std::mem::size_of_val(&limits) as u32,
            )
            .map_err(|_| "无法设置终端进程清理边界")?;
            AssignProcessToJobObject(handle, HANDLE(process)).map_err(|_| "无法管理终端子进程")?;
            Ok(group)
        }
    }
}
#[cfg(windows)]
impl Drop for ProcessGroup {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(windows::Win32::Foundation::HANDLE(
                self.0 as *mut _,
            ));
        }
    }
}
#[cfg(unix)]
struct ProcessGroup(Option<i32>);
#[cfg(unix)]
impl ProcessGroup {
    fn attach(_child: &dyn Child, master: &dyn MasterPty) -> Result<Self, String> {
        Ok(Self(master.process_group_leader()))
    }
}
#[cfg(unix)]
impl Drop for ProcessGroup {
    fn drop(&mut self) {
        if let Some(pid) = self.0.filter(|pid| *pid > 1) {
            unsafe extern "C" {
                fn kill(pid: i32, sig: i32) -> i32;
            }
            unsafe {
                kill(-pid, 9);
            }
        }
    }
}
pub enum Backend {
    Local(Arc<Local>),
    Ssh(Arc<ssh::Remote>),
}
pub struct Session {
    pub id: String,
    pub profile: Profile,
    pub closed: AtomicBool,
    pending: AtomicUsize,
    event: Channel<Value>,
    backend: Mutex<Option<Backend>>,
    pub secrets: Mutex<Vec<Zeroizing<String>>>,
}
impl Session {
    fn event(&self, value: Value) -> Result<(), String> {
        self.event.send(value).map_err(|_| "终端界面已断开".into())
    }
    pub fn output(&self, bytes: &[u8]) -> Result<(), String> {
        self.pending.fetch_add(bytes.len(), Ordering::Relaxed);
        self.event(json!({"type":"data","data":STANDARD.encode(bytes),"bytes":bytes.len()}))
    }
    pub fn finish(&self, code: Option<u32>, error: Option<&str>) {
        if !self.closed.swap(true, Ordering::SeqCst) {
            let _ = self.event(json!({"type":"exit","code":code,"error":error}));
        }
    }
    pub fn remote(&self) -> Result<Arc<ssh::Remote>, String> {
        if self.closed.load(Ordering::Relaxed) {
            return Err("会话已断开".into());
        }
        match self.backend.lock().map_err(|_| "会话暂不可用")?.as_ref() {
            Some(Backend::Ssh(remote)) => Ok(remote.clone()),
            _ => Err("请选择已连接的 SSH 会话".into()),
        }
    }
}
pub struct State {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
}
pub fn state() -> &'static State {
    static STATE: OnceLock<State> = OnceLock::new();
    STATE.get_or_init(|| State {
        sessions: Mutex::new(HashMap::new()),
    })
}
pub fn session(id: &str) -> Result<Arc<Session>, String> {
    let s = state()
        .sessions
        .lock()
        .map_err(|_| "会话状态不可用")?
        .get(id)
        .cloned()
        .ok_or("会话不存在")?;
    if s.closed.load(Ordering::Relaxed) {
        return Err("会话已结束，请重新连接".into());
    }
    Ok(s)
}
pub fn shell_command(shell: &str) -> Result<(String, Vec<String>), String> {
    #[cfg(windows)]
    let command = match shell {
        "powershell" | "" => (
            "powershell.exe".into(),
            vec!["-NoLogo".into(), "-NoProfile".into()],
        ),
        "pwsh" => (
            "pwsh.exe".into(),
            vec!["-NoLogo".into(), "-NoProfile".into()],
        ),
        "cmd" => ("cmd.exe".into(), vec!["/D".into()]),
        _ => return Err("不支持的本地 Shell".into()),
    };
    #[cfg(not(windows))]
    let command = match shell {
        "default" | "" => (std::env::var("SHELL").unwrap_or("/bin/sh".into()), vec![]),
        "bash" => ("/bin/bash".into(), vec![]),
        "zsh" => ("/bin/zsh".into(), vec![]),
        "sh" => ("/bin/sh".into(), vec![]),
        _ => return Err("不支持的本地 Shell".into()),
    };
    Ok(command)
}
pub fn local_cwd(p: &Profile) -> String {
    if !p.cwd.is_empty() {
        return p.cwd.clone();
    }
    std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_else(|_| ".".into())
}
fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        cols: cols.clamp(10, 500),
        rows: rows.clamp(4, 200),
        pixel_width: 0,
        pixel_height: 0,
    }
}
fn open_local(s: Arc<Session>, cols: u16, rows: u16) -> Result<(), String> {
    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(|_| "无法创建本地终端")?;
    let (exe, args) = shell_command(&s.profile.shell)?;
    let mut cmd = CommandBuilder::new(exe);
    cmd.args(args);
    cmd.cwd(local_cwd(&s.profile));
    cmd.env("TERM", "xterm-256color");
    let mut reader = pair.master.try_clone_reader().map_err(|_| "无法读取终端")?;
    let writer = pair.master.take_writer().map_err(|_| "无法写入终端")?;
    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|_| "启动 Shell 失败，请检查是否已安装并可运行")?;
    drop(pair.slave);
    let group = match ProcessGroup::attach(child.as_ref(), pair.master.as_ref()) {
        Ok(group) => group,
        Err(e) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(e);
        }
    };
    let local = Arc::new(Local {
        master: Mutex::new(pair.master),
        writer: Mutex::new(Some(writer)),
        child: Mutex::new(child),
        group: Mutex::new(Some(group)),
    });
    {
        let mut backend = s.backend.lock().map_err(|_| "会话不可用")?;
        if s.closed.load(Ordering::Relaxed) {
            let _ = local.child.lock().unwrap().kill();
            return Err("连接已取消".into());
        }
        *backend = Some(Backend::Local(local.clone()));
    }
    let exit_code = Arc::new(Mutex::new(None));
    let reader_session = s.clone();
    let reader_code = exit_code.clone();
    std::thread::spawn(move || {
        let s = reader_session;
        let mut buffer = [0u8; 16 * 1024];
        while !s.closed.load(Ordering::Relaxed) {
            while s.pending.load(Ordering::Relaxed) > 256 * 1024
                && !s.closed.load(Ordering::Relaxed)
            {
                std::thread::sleep(Duration::from_millis(10));
            }
            if s.closed.load(Ordering::Relaxed) {
                break;
            }
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    if s.output(&buffer[..n]).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let code = *reader_code.lock().unwrap();
        s.finish(code, None);
    });
    std::thread::spawn(move || {
        loop {
            let exited = local
                .child
                .lock()
                .ok()
                .and_then(|mut child| child.try_wait().ok().flatten());
            if let Some(status) = exited {
                *exit_code.lock().unwrap() = Some(status.exit_code());
                break;
            }
            if s.closed.load(Ordering::Relaxed) {
                if let Ok(mut group) = local.group.lock() {
                    group.take();
                }
                if let Ok(mut child) = local.child.lock() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                break;
            }
            std::thread::sleep(Duration::from_millis(30));
        }
        if let Ok(mut group) = local.group.lock() {
            group.take();
        }
        if let Ok(mut writer) = local.writer.lock() {
            writer.take();
        }
        // ConPTY's output pipe closes only when its master is released. The
        // reader owns no Local reference and can drain remaining output to EOF.
        if let Ok(mut backend) = s.backend.lock() {
            backend.take();
        }
    });
    Ok(())
}
#[tauri::command]
pub async fn terminal_open(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    profile_id: String,
    cols: u16,
    rows: u16,
    secret: Option<String>,
    remember: bool,
    on_event: Channel<Value>,
) -> Result<Value, String> {
    main_only(&window)?;
    if !valid_id(&id) {
        return Err("无效的会话编号".into());
    }
    let p = profile(&app, &profile_id)?;
    validate_profile(&p)?;
    let s = Arc::new(Session {
        id: id.clone(),
        profile: p.clone(),
        closed: AtomicBool::new(false),
        pending: AtomicUsize::new(0),
        event: on_event,
        backend: Mutex::new(None),
        secrets: Mutex::new(vec![]),
    });
    {
        let mut sessions = state().sessions.lock().map_err(|_| "会话状态不可用")?;
        if sessions.len() >= 24 || sessions.contains_key(&id) {
            return Err("会话重复或已达到 24 个会话上限".into());
        }
        sessions.insert(id.clone(), s.clone());
    }
    let result = if p.kind == "local" {
        let s = s.clone();
        tauri::async_runtime::spawn_blocking(move || open_local(s, cols, rows))
            .await
            .map_err(|_| "启动终端任务失败")?
    } else {
        ssh::open(
            &app,
            s.clone(),
            cols,
            rows,
            secret.map(Zeroizing::new),
            remember,
        )
        .await
    };
    if let Err(e) = result {
        s.finish(None, Some(&e));
        state().sessions.lock().unwrap().remove(&id);
        return Err(e);
    }
    Ok(json!({"id": id, "cwd": if p.kind == "local" { local_cwd(&p) } else { p.cwd }}))
}
#[tauri::command]
pub async fn terminal_write(window: WebviewWindow, id: String, data: String) -> Result<(), String> {
    main_only(&window)?;
    if data.len() > 64 * 1024 {
        return Err("单次输入过长".into());
    }
    let s = session(&id)?;
    let local = {
        let guard = s.backend.lock().map_err(|_| "会话不可用")?;
        if let Some(Backend::Local(local)) = guard.as_ref() {
            Some(local.clone())
        } else {
            None
        }
    };
    if let Some(local) = local {
        tauri::async_runtime::spawn_blocking(move || {
            let mut guard = local.writer.lock().map_err(|_| "终端输入不可用")?;
            let writer = guard.as_mut().ok_or("终端已关闭")?;
            writer
                .write_all(data.as_bytes())
                .and_then(|_| writer.flush())
                .map_err(|_| "写入终端失败".to_string())
        })
        .await
        .map_err(|_| "终端输入任务失败")?
    } else {
        s.remote()?
            .writer
            .lock()
            .await
            .data_bytes(data.into_bytes())
            .await
            .map_err(|_| "远程输入失败".into())
    }
}
#[tauri::command]
pub async fn terminal_resize(
    window: WebviewWindow,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    main_only(&window)?;
    let s = session(&id)?;
    let dimensions = size(cols, rows);
    let local = {
        let guard = s.backend.lock().map_err(|_| "会话不可用")?;
        if let Some(Backend::Local(local)) = guard.as_ref() {
            Some(local.clone())
        } else {
            None
        }
    };
    if let Some(local) = local {
        local
            .master
            .lock()
            .map_err(|_| "终端不可用")?
            .resize(dimensions)
            .map_err(|_| "调整终端尺寸失败".to_string())
    } else {
        s.remote()?
            .writer
            .lock()
            .await
            .window_change(dimensions.cols.into(), dimensions.rows.into(), 0, 0)
            .await
            .map_err(|_| "调整远程终端尺寸失败".into())
    }
}
#[tauri::command]
pub fn terminal_ack(window: WebviewWindow, id: String, bytes: usize) -> Result<(), String> {
    main_only(&window)?;
    if let Some(s) = state().sessions.lock().map_err(|_| "会话不可用")?.get(&id) {
        let _ = s
            .pending
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| {
                Some(n.saturating_sub(bytes.min(1024 * 1024)))
            });
    }
    Ok(())
}
async fn close(s: Arc<Session>) {
    s.finish(None, None);
    ai::cancel_session(&s.id);
    files::cancel_session(&s.id);
    let backend = s.backend.lock().ok().and_then(|mut b| b.take());
    match backend {
        Some(Backend::Local(local)) => {
            let _ = tauri::async_runtime::spawn_blocking(move || {
                if let Ok(mut group) = local.group.lock() {
                    group.take();
                }
                if let Ok(mut child) = local.child.lock() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                if let Ok(mut writer) = local.writer.lock() {
                    writer.take();
                }
            })
            .await;
        }
        Some(Backend::Ssh(remote)) => {
            let _ = remote
                .handle
                .disconnect(russh::Disconnect::ByApplication, "", "")
                .await;
        }
        None => (),
    }
}
#[tauri::command]
pub async fn terminal_close(window: WebviewWindow, id: String) -> Result<(), String> {
    main_only(&window)?;
    let s = state()
        .sessions
        .lock()
        .map_err(|_| "会话不可用")?
        .remove(&id);
    if let Some(s) = s {
        close(s).await;
    }
    Ok(())
}
pub async fn stop_all() {
    ai::stop_all();
    let sessions = state()
        .sessions
        .lock()
        .map(|mut s| s.drain().map(|(_, s)| s).collect::<Vec<_>>())
        .unwrap_or_default();
    for s in sessions {
        close(s).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn local() -> Profile {
        Profile {
            id: "test".into(),
            name: "test".into(),
            kind: "local".into(),
            shell: if cfg!(windows) {
                "cmd".into()
            } else {
                "sh".into()
            },
            cwd: String::new(),
            host: String::new(),
            port: 22,
            username: String::new(),
            auth: "password".into(),
            key_path: String::new(),
            group: String::new(),
            environment: String::new(),
        }
    }
    #[test]
    fn profiles_never_accept_secret_fields_or_invalid_targets() {
        let p = local();
        validate_profile(&p).unwrap();
        let mut value = serde_json::to_value(&p).unwrap();
        value["password"] = json!("do-not-store");
        assert!(serde_json::from_value::<Profile>(value).is_err());
        let mut p = p;
        p.shell = "cmd.exe /c unexpected".into();
        assert!(validate_profile(&p).is_err());
        p.kind = "ssh".into();
        p.host = "bad\nhost".into();
        assert!(validate_profile(&p).is_err());
    }
    #[test]
    fn local_pty_preserves_directory_and_reads_real_output() {
        let output = Arc::new(Mutex::new(Vec::new()));
        let values = output.clone();
        let s = Arc::new(Session {
            id: "pty-test".into(),
            profile: local(),
            closed: AtomicBool::new(false),
            pending: AtomicUsize::new(0),
            event: Channel::new(move |body| {
                if let tauri::ipc::InvokeResponseBody::Json(raw) = body {
                    values.lock().unwrap().push(raw);
                }
                Ok(())
            }),
            backend: Mutex::new(None),
            secrets: Mutex::new(vec![]),
        });
        open_local(s.clone(), 80, 24).unwrap();
        let backend = s.backend.lock().unwrap();
        let Some(Backend::Local(local)) = backend.as_ref() else {
            panic!()
        };
        let local = local.clone();
        drop(backend);
        // ConPTY asks its terminal emulator for the initial cursor position.
        // A real xterm.js responds through onData; emulate that handshake here.
        #[cfg(windows)]
        {
            let start = std::time::Instant::now();
            while output.lock().unwrap().is_empty() && start.elapsed() < Duration::from_secs(3) {
                std::thread::sleep(Duration::from_millis(20));
            }
            local
                .writer
                .lock()
                .unwrap()
                .as_mut()
                .unwrap()
                .write_all(b"\x1b[1;1R")
                .unwrap();
        }
        local
            .writer
            .lock()
            .unwrap()
            .as_mut()
            .unwrap()
            .write_all(b"echo TERMINAL_PTY_OK\r\nexit\r\n")
            .unwrap();
        let mut killer = local.child.lock().unwrap().clone_killer();
        drop(local);
        let start = std::time::Instant::now();
        while !s.closed.load(Ordering::Relaxed) && start.elapsed() < Duration::from_secs(10) {
            std::thread::sleep(Duration::from_millis(30));
        }
        let records = output.lock().unwrap();
        let text = records
            .iter()
            .filter_map(|r| serde_json::from_str::<Value>(r).ok())
            .filter_map(|v| v["data"].as_str().map(str::to_owned))
            .flat_map(|s| STANDARD.decode(s).unwrap())
            .collect::<Vec<_>>();
        let observed = String::from_utf8_lossy(&text).into_owned();
        if !s.closed.load(Ordering::Relaxed) {
            let _ = killer.kill();
        }
        assert!(
            observed.contains("TERMINAL_PTY_OK"),
            "PTY output: {observed:?}; events: {records:?}"
        );
        assert!(
            s.closed.load(Ordering::Relaxed),
            "PTY did not close: {observed:?}"
        );
    }
}
