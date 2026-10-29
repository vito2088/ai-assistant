//! Rust owns capture lifecycle and global shortcuts; WebView events are UI updates only.
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    str::FromStr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};
use windows::Win32::{
    Foundation::{HWND, LPARAM, WPARAM},
    UI::WindowsAndMessaging::{PostMessageW, WM_APP},
};

pub const NOTIFY: u32 = WM_APP + 27;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Screenshot,
    Recording,
}
impl Kind {
    pub fn key(self) -> &'static str {
        if self == Self::Screenshot {
            "screenshot"
        } else {
            "recording"
        }
    }
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "screenshot" => Ok(Self::Screenshot),
            "recording" => Ok(Self::Recording),
            _ => Err("无效捕获类型".into()),
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeOptions {
    pub display_id: usize,
    pub hide_helper: bool,
}
impl Default for RuntimeOptions {
    fn default() -> Self {
        Self {
            display_id: 1,
            hide_helper: true,
        }
    }
}

#[derive(Clone)]
pub struct Options {
    pub id: String,
    pub kind: Kind,
    pub display_id: usize,
    pub language: String,
    pub screenshot_directory: String,
    pub countdown: u32,
    pub fps: u32,
    pub cursor: bool,
    pub auto_ocr: bool,
    pub auto_translate: bool,
    pub ai_enabled: bool,
}
impl Options {
    pub fn tr<'a>(&self, zh: &'a str, en: &'a str, es: &'a str) -> &'a str {
        match self.language.as_str() {
            "en" => en,
            "es" => es,
            _ => zh,
        }
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub active: bool,
    pub id: Option<String>,
    pub kind: Option<Kind>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub id: String,
    pub revision: u64,
    pub text: String,
    pub translated: String,
    pub error: String,
}
pub enum Message {
    Cancel,
    Stop,
    Pause,
    Ocr(OcrResult),
    Recording(super::tools::RecordingStatus),
    Failure(String),
}
struct Context {
    id: String,
    kind: Kind,
    hwnd: isize,
    revision: u64,
    messages: VecDeque<Message>,
    drafts: HashSet<String>,
    pending_ocr: Option<serde_json::Value>,
}
impl Context {
    fn new(id: String, kind: Kind) -> Self {
        Self {id,kind,hwnd:0,revision:0,messages:VecDeque::new(),drafts:HashSet::new(),pending_ocr:None}
    }
    fn notify(&self) {
        if self.hwnd != 0 {
            unsafe {let _=PostMessageW(Some(HWND(self.hwnd as *mut _)),NOTIFY,WPARAM(0),LPARAM(0));}
        }
    }
}
#[derive(Default)]
pub struct Service {
    pub busy: AtomicBool,
    runtime: Mutex<RuntimeOptions>,
    current: Mutex<Option<Context>>,
    shortcuts: Mutex<HashMap<u32, (Kind, String)>>,
    editing: Mutex<Option<Kind>>,
}

fn setting(app: &AppHandle, key: &str) -> serde_json::Value {
    super::get_setting(app.clone(), key.into())
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}
fn language(app: &AppHandle) -> String {
    super::get_setting(app.clone(), "ui_language".into())
        .ok()
        .flatten()
        .unwrap_or_else(|| "zh-CN".into())
}
pub fn configure(app: &AppHandle, display_id: usize, hide_helper: bool) -> Result<(), String> {
    if display_id < 1 {
        return Err("无效显示器".into());
    }
    *app.state::<Service>()
        .runtime
        .lock()
        .map_err(|e| e.to_string())? = RuntimeOptions {
        display_id,
        hide_helper,
    };
    Ok(())
}
pub fn runtime(app: &AppHandle) -> Result<RuntimeOptions, String> {
    Ok(app
        .state::<Service>()
        .runtime
        .lock()
        .map_err(|e| e.to_string())?
        .clone())
}
pub fn status(app: &AppHandle) -> Status {
    let s = app.state::<Service>();
    let current = s
        .current
        .lock()
        .ok()
        .and_then(|c| c.as_ref().map(|c| (c.kind, c.id.clone())));
    Status {
        active: s.busy.load(Ordering::Acquire),
        kind: current.as_ref().map(|c| c.0),
        id: current.map(|c| c.1),
    }
}

pub fn attach(app: &AppHandle, options: &Options, hwnd: HWND) {
    let s=app.state::<Service>();
    let mut current=s.current.lock().unwrap_or_else(|e| e.into_inner());
    let c=current.get_or_insert_with(||Context::new(options.id.clone(),options.kind));
    c.hwnd=hwnd.0 as isize;
    if !c.messages.is_empty(){c.notify();}
}
pub fn messages(app: &AppHandle, id: &str) -> Vec<Message> {
    let s = app.state::<Service>();
    let mut guard = s.current.lock().unwrap_or_else(|e| e.into_inner());
    guard
        .as_mut()
        .filter(|c| c.id == id)
        .map(|c| c.messages.drain(..).collect())
        .unwrap_or_default()
}
pub fn post(app: &AppHandle, message: Message) {
    if let Ok(mut current) = app.state::<Service>().current.lock() {
        if let Some(c) = current.as_mut() {
            c.messages.push_back(message);
            c.notify();
        }
    }
}
pub fn post_for(app: &AppHandle, id: &str, message: Message) {
    if let Ok(mut guard) = app.state::<Service>().current.lock() {
        if let Some(c) = guard.as_mut().filter(|c| c.id == id) {
            c.messages.push_back(message);
            c.notify();
        }
    }
}
pub fn request_ocr(
    app: &AppHandle,
    options: &Options,
    revision: u64,
    path: String,
    translate: bool,
    text: String,
) -> Result<(), String> {
    let state = app.state::<Service>();
    let mut guard = state.current.lock().map_err(|e| e.to_string())?;
    let c = guard
        .as_mut()
        .filter(|c| c.id == options.id)
        .ok_or("捕获已结束")?;
    for old in c.drafts.drain() {
        let _ = super::capture_workspace::delete_capture_draft(app.clone(), old);
    }
    c.revision = revision;
    if !path.is_empty() {
        c.drafts.insert(path.clone());
    }
    let payload = serde_json::json!({"id":options.id,"revision":revision,"path":path,"translate":translate,"text":text});
    c.pending_ocr = Some(payload.clone());
    drop(guard);
    app.emit("native-capture-ocr", payload).map_err(|e|e.to_string())
}
pub fn pending_ocr(app: &AppHandle) -> Option<serde_json::Value> {
    app.state::<Service>().current.lock().ok().and_then(|c| c.as_ref().and_then(|c| c.pending_ocr.clone()))
}
pub fn ocr_result(app: &AppHandle, result: OcrResult) -> Result<(), String> {
    if result.text.len() > 100_000
        || result.translated.len() > 100_000
        || result.error.len() > 10_000
    {
        return Err("识别结果过长".into());
    }
    let state = app.state::<Service>();
    let mut guard = state.current.lock().map_err(|e| e.to_string())?;
    if let Some(c) = guard
        .as_mut()
        .filter(|c| c.id == result.id && c.revision == result.revision)
    {
        c.pending_ocr = None;
        for old in c.drafts.drain() {
            let _ = super::capture_workspace::delete_capture_draft(app.clone(), old);
        }
        c.messages.push_back(Message::Ocr(result));
        unsafe {
            let _ = PostMessageW(Some(HWND(c.hwnd as *mut _)), NOTIFY, WPARAM(0), LPARAM(0));
        }
    }
    Ok(())
}
fn detach(app: &AppHandle) {
    if let Some(c) = app
        .state::<Service>()
        .current
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take()
    {
        for p in c.drafts {
            let _ = super::capture_workspace::delete_capture_draft(app.clone(), p);
        }
    }
}

pub fn start(app: &AppHandle, kind: Kind) -> Result<(), String> {
    if kind == Kind::Recording && super::tools::recording_active(app) {
        post(app, Message::Stop);
        return Ok(());
    }
    let service = app.state::<Service>();
    service
        .busy
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| "请先完成当前截图或录屏".to_string())?;
    let id=uuid::Uuid::new_v4().to_string();
    *service.current.lock().unwrap_or_else(|e|e.into_inner())=Some(Context::new(id.clone(),kind));
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let outcome = (|| {
            let visibility = setting(&app, "feature_visibility");
            if visibility[kind.key()] == false {
                return Err("请先在设置中显示此功能".into());
            }
            if super::tools::recording_active(&app) {
                return Err("请先结束录屏".into());
            }
            let runtime = runtime(&app)?;
            let p = setting(&app, "capture_preferences");
            let options = Options {
                id: id.clone(),
                kind,
                display_id: runtime.display_id,
                language: language(&app),
                screenshot_directory: p["screenshotDirectory"].as_str().unwrap_or("").into(),
                countdown: p["countdown"].as_u64().unwrap_or(3).min(10) as u32,
                fps: p["fps"].as_u64().unwrap_or(30).clamp(15, 60) as u32,
                cursor: p["cursor"].as_bool().unwrap_or(true),
                auto_ocr: p["autoOcr"].as_bool().unwrap_or(false),
                auto_translate: p["autoTranslate"].as_bool().unwrap_or(false),
                ai_enabled: visibility["aiChat"] != false,
            };
            let main = app.get_webview_window("main").ok_or("主窗口不可用")?;
            let visible = main.is_visible().map_err(|e| e.to_string())?;
            let minimized = main.is_minimized().map_err(|e| e.to_string())?;
            let focused = main.is_focused().unwrap_or(false);
            if runtime.hide_helper && visible && !minimized {
                main.hide().map_err(|e| e.to_string())?;
            }
            let _ = app.emit(
                "native-capture-started",
                serde_json::json!({"kind":kind,"id":id}),
            );
            let result = super::native_capture::run_editor(app.clone(), options);
            let force = kind == Kind::Recording || result.is_err();
            if force || (runtime.hide_helper && visible && !minimized) {
                let _ = main.show();
                let _ = main.unminimize();
                if force || focused {
                    let _ = main.set_focus();
                }
            }
            result
        })();
        detach(&app);
        app.state::<Service>().busy.store(false, Ordering::Release);
        match outcome {
            Ok(result) => {
                let _ = app.emit(
                    "native-capture-finished",
                    serde_json::json!({"kind":kind,"id":id,"result":result}),
                );
            }
            Err(error) => {
                let _ = app.emit(
                    "native-capture-finished",
                    serde_json::json!({"kind":kind,"id":id,"error":error}),
                );
            }
        }
    });
    Ok(())
}

fn parsed(key: &str) -> Result<Shortcut, String> {
    if !key
        .split('+')
        .any(|p| matches!(p, "Ctrl" | "Alt" | "Super"))
    {
        return Err("快捷键必须包含 Ctrl、Alt 或 Win/⌘".into());
    }
    Shortcut::from_str(key).map_err(|e| e.to_string())
}
pub fn register(app: &AppHandle, kind: Kind, key: String) -> Result<(), String> {
    let shortcut = parsed(&key)?;
    let state = app.state::<Service>();
    if state
        .shortcuts
        .lock()
        .map_err(|e| e.to_string())?
        .contains_key(&shortcut.id())
    {
        state
            .shortcuts
            .lock()
            .map_err(|e| e.to_string())?
            .insert(shortcut.id(), (kind, key));
        return Ok(());
    }
    app.global_shortcut()
        .register(shortcut)
        .map_err(|e| e.to_string())?;
    state
        .shortcuts
        .lock()
        .map_err(|e| e.to_string())?
        .insert(shortcut.id(), (kind, key));
    Ok(())
}
pub fn unregister(app: &AppHandle, key: &str) -> Result<(), String> {
    let shortcut = parsed(key)?;
    app.global_shortcut()
        .unregister(shortcut)
        .map_err(|e| e.to_string())?;
    app.state::<Service>()
        .shortcuts
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&shortcut.id());
    Ok(())
}
pub fn sync_shortcuts(app: &AppHandle) -> Result<(), String> {
    let saved = setting(app, "capture_shortcuts");
    let mut wanted = HashSet::new();
    for kind in [Kind::Screenshot, Kind::Recording] {
        let key = saved[kind.key()]
            .as_str()
            .unwrap_or(if kind == Kind::Screenshot {
                "Ctrl+Alt+KeyA"
            } else {
                "Ctrl+Alt+KeyR"
            });
        if key.is_empty() {
            continue;
        }
        let Ok(shortcut) = parsed(key) else {
            continue;
        };
        wanted.insert(shortcut.id());
        let _ = register(app, kind, key.into());
    }
    let existing = app
        .state::<Service>()
        .shortcuts
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    for (id, (_, key)) in existing {
        if !wanted.contains(&id) {
            unregister(app, &key)?;
        }
    }
    Ok(())
}
pub fn edit_shortcut(app: &AppHandle, kind: Option<Kind>) {
    let kind = kind.filter(|_| app.get_webview_window("main").is_some_and(|w| w.is_focused().unwrap_or(false)));
    *app.state::<Service>()
        .editing
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = kind;
}
pub fn shortcut(app: &AppHandle, key: &Shortcut, event: ShortcutEvent) {
    if event.state != ShortcutState::Released {
        return;
    }
    let state = app.state::<Service>();
    let binding = state
        .shortcuts
        .lock()
        .ok()
        .and_then(|m| m.get(&key.id()).cloned());
    if let Some((kind, value)) = binding {
        if let Some(edit) = state.editing.lock().ok().and_then(|e| *e) {
            let _ = app.emit(
                "native-shortcut-edit",
                serde_json::json!({"kind":edit,"key":value}),
            );
            return;
        }
        if state.busy.load(Ordering::Acquire)
            && !(kind == Kind::Recording && super::tools::recording_active(app))
        {
            return;
        }
        if let Err(error) = start(app, kind) {
            let _ = app.emit("native-capture-error", error);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hotkey_ids_normalize_and_require_a_global_modifier() {
        assert_eq!(
            parsed("Ctrl+Alt+KeyA").unwrap().id(),
            Shortcut::from_str("Ctrl+Alt+KeyA").unwrap().id()
        );
        assert!(parsed("KeyA").is_err());
        assert!(parsed("Shift+KeyA").is_err());
        assert!(parsed("Super+KeyA").is_ok());
    }
}
