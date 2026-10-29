//! Local drafts survive a cancelled save dialog and an application restart.
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Emitter, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

fn disable_capture_transitions(window: &tauri::WebviewWindow) {
    #[cfg(windows)]
    if let Ok(handle)=window.hwnd() {
        use windows::Win32::{Foundation::HWND,Graphics::Dwm::{DwmSetWindowAttribute,DWMWA_TRANSITIONS_FORCEDISABLED}};
        let disabled=1i32;
        unsafe {let _=DwmSetWindowAttribute(HWND(handle.0),DWMWA_TRANSITIONS_FORCEDISABLED,(&disabled as *const i32).cast(),std::mem::size_of::<i32>() as u32);}
    }
    #[cfg(not(windows))]
    let _=window;
}

fn directory(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("capture-drafts");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
fn checked(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let file = PathBuf::from(path);
    let parent = file.parent().ok_or("无效草稿路径")?.canonicalize().map_err(|e| e.to_string())?;
    if parent != directory(app)?.canonicalize().map_err(|e| e.to_string())? || !file.file_name().and_then(|s| s.to_str()).is_some_and(|n| n.starts_with("capture-")) {
        return Err("无效草稿路径".into());
    }
    super::tools::validate_output(path, &["png", "mp4", "webm"])
}
#[tauri::command]
pub fn new_capture_draft(app: AppHandle, extension: String) -> Result<String, String> {
    if !["png", "mp4", "webm"].contains(&extension.as_str()) { return Err("不支持的格式".into()); }
    Ok(directory(&app)?.join(format!("capture-{}.{}", Uuid::new_v4(), extension)).to_string_lossy().into())
}
#[tauri::command]
pub async fn read_capture_draft(app: AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    let path = checked(&app, &path)?;
    // Previews are images; never transport a recording into JS memory.
    if path.extension().and_then(|s| s.to_str()) != Some("png") { return Err("只支持图片预览".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::read(path).map(tauri::ipc::Response::new).map_err(|e|e.to_string())
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn save_capture_draft(app: AppHandle, path: String, destination: String) -> Result<(), String> {
    let source = checked(&app, &path)?;
    let ext = source.extension().and_then(|e| e.to_str()).ok_or("无效格式")?;
    let target = super::tools::validate_output(&destination, &[ext])?;
    tauri::async_runtime::spawn_blocking(move || {
        if source == target { return Err("请选择草稿目录以外的位置".into()); }
        // Write a sibling first, so a failed copy cannot truncate an existing destination.
        let staging = target.with_file_name(format!(".capture-save-{}.part", Uuid::new_v4()));
        let result = (|| {
            std::fs::copy(&source, &staging).map_err(|e| e.to_string())?;
            std::fs::rename(&staging, &target).map_err(|e| e.to_string())?;
            Ok(())
        })();
        if result.is_err() { let _ = std::fs::remove_file(&staging); }
        result
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn delete_capture_draft(app: AppHandle, path: String) -> Result<(), String> {
    let path = checked(&app, &path)?;
    if path.exists() { std::fs::remove_file(path).map_err(|e| e.to_string())?; }
    Ok(())
}
#[derive(serde::Serialize)]
pub struct Draft { path: String, bytes: u64, modified: u64 }
#[tauri::command]
pub fn list_capture_drafts(app: AppHandle) -> Result<Vec<Draft>, String> {
    let mut items = Vec::new();
    for entry in std::fs::read_dir(directory(&app)?).map_err(|e| e.to_string())?.flatten() {
        let p = entry.path();
        if checked(&app, &p.to_string_lossy()).is_err() { continue; }
        if let Ok(m) = entry.metadata() { if m.is_file() && m.len() > 0 {
            items.push(Draft { path: p.to_string_lossy().into(), bytes: m.len(), modified: m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |t| t.as_secs()) });
        } }
    }
    items.sort_by_key(|d| std::cmp::Reverse(d.modified));
    Ok(items)
}
#[tauri::command]
pub fn open_system_capture_editor(app: AppHandle, path: String) -> Result<(), String> {
    #[cfg(windows)] { let _ = (app,path); Err("Windows 使用原生截图编辑器".into()) }
    #[cfg(not(windows))] {
        let file=checked(&app,&path)?;
        if !file.is_file() || file.extension().and_then(|s|s.to_str())!=Some("png") { return Err("截图尚未生成".into()); }
        if app.get_webview_window("system-capture").is_some() { return Err("请先完成当前截图".into()); }
        let main=app.get_webview_window("main").ok_or("主窗口不可用")?;
        let monitor=main.current_monitor().map_err(|e|e.to_string())?.ok_or("显示器不可用")?;
        let mut url=tauri::Url::parse("http://localhost/system-capture.html").map_err(|e|e.to_string())?;
        url.query_pairs_mut().append_pair("path",&path);
        let w=WebviewWindowBuilder::new(&app,"system-capture",WebviewUrl::App(format!("system-capture.html?{}",url.query().unwrap_or("")).into()))
            .title("小助手 · 系统截图编辑").decorations(false).resizable(false).shadow(false).always_on_top(true).skip_taskbar(true).visible(false).build().map_err(|e|e.to_string())?;
        let result=(||{w.set_position(*monitor.position()).map_err(|e|e.to_string())?;w.set_size(*monitor.size()).map_err(|e|e.to_string())?;Ok(())})();
        if result.is_err(){let _=w.destroy();}result
    }
}
#[tauri::command]
pub fn capture_window_ready(window: tauri::WebviewWindow) -> Result<(),String> {
    if !window.label().starts_with("capture-pin-") && !(cfg!(not(windows)) && window.label()=="system-capture") {return Err("无效捕获窗口".into());}
    window.show().map_err(|e|e.to_string())?;
    if window.label()=="system-capture" {window.set_focus().map_err(|e|e.to_string())?;}
    Ok(())
}
#[tauri::command]
pub fn close_system_capture_editor(app: AppHandle)->Result<(),String>{
    if let Some(w)=app.get_webview_window("system-capture"){w.destroy().map_err(|e|e.to_string())?;}
    Ok(())
}
pub fn cancel_on_close(app: &AppHandle) {let _=app.emit("capture-cancel",());}

#[derive(serde::Deserialize)]
pub struct PinBounds { x: f64, y: f64, width: f64, height: f64 }

#[tauri::command]
pub async fn pin_capture(app: AppHandle, path: String, bounds: PinBounds) -> Result<(), String> {
    let file = checked(&app, &path)?;
    if !file.is_file() || file.extension().and_then(|v| v.to_str()) != Some("png") { return Err("截图尚未生成".into()); }
    if ![bounds.x, bounds.y, bounds.width, bounds.height].iter().all(|n| n.is_finite() && *n >= 0.0)
        || bounds.width == 0.0 || bounds.height == 0.0 || bounds.x + bounds.width > 1.000001 || bounds.y + bounds.height > 1.000001 {
        return Err("无效的贴图选区".into());
    }
    let overlay = app.get_webview_window("system-capture").ok_or("截图窗口已关闭")?;
    let origin = overlay.inner_position().map_err(|e| e.to_string())?;
    let screen = overlay.inner_size().map_err(|e| e.to_string())?;
    let scale = overlay.scale_factor().map_err(|e| e.to_string())?;
    // Keep controls reachable for tiny selections, and keep large captures inside the display.
    let width = (bounds.width * screen.width as f64).max(150.0 * scale).min(screen.width as f64).round() as u32;
    let controls_height=(44.0*scale).ceil() as u32;
    let height = (bounds.height * screen.height as f64).max(80.0 * scale).min(screen.height.saturating_sub(controls_height) as f64).round() as u32;
    let window_height=height+controls_height;
    let x = origin.x + ((bounds.x * screen.width as f64).round() as i32).min(screen.width.saturating_sub(width) as i32);
    let y = origin.y + ((bounds.y * screen.height as f64).round() as i32).min(screen.height.saturating_sub(window_height) as i32);
    let mut url = tauri::Url::parse("http://localhost/capture-pin.html").map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("path", &path);
    let label = format!("capture-pin-{}", Uuid::new_v4());
    let pinned = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(format!("capture-pin.html?{}", url.query().unwrap_or("")).into()))
        .title("小助手 · 截图贴图").transparent(true).no_redirection_bitmap(true).decorations(false).resizable(false).shadow(false).skip_taskbar(true).always_on_top(true).visible(false).build().map_err(|e| e.to_string())?;
    disable_capture_transitions(&pinned);
    let result = (|| {
        pinned.set_size(tauri::PhysicalSize::new(width, window_height)).map_err(|e| e.to_string())?;
        pinned.set_position(tauri::PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;

        Ok(())
    })();
    if result.is_err() { let _ = pinned.destroy(); }
    result
}

#[tauri::command]
pub fn close_pinned_capture(window: tauri::WebviewWindow) -> Result<(), String> {
    if !window.label().starts_with("capture-pin-") { return Err("只能关闭当前贴图窗口".into()); }
    window.destroy().map_err(|e| e.to_string())
}

/// The pin viewer is independent of either capture implementation.
pub fn pin_native_image(app:&AppHandle,path:&str,x:i32,y:i32,width:u32,height:u32,screen_x:i32,screen_y:i32,screen_width:u32,screen_height:u32,scale:f64)->Result<(),String>{
    let file=checked(app,path)?;if !file.is_file(){return Err("截图尚未生成".into());}
    let width=width.max((150.0*scale)as u32).min(screen_width);let controls=(44.0*scale)as u32;
    let height=height.max((80.0*scale)as u32).min(screen_height.saturating_sub(controls));
    let x=x.min(screen_x+screen_width.saturating_sub(width)as i32).max(screen_x);
    let y=y.min(screen_y+screen_height.saturating_sub(height+controls)as i32).max(screen_y);
    let mut url=tauri::Url::parse("http://localhost/capture-pin.html").map_err(|e|e.to_string())?;url.query_pairs_mut().append_pair("path",path);
    let label=format!("capture-pin-{}",Uuid::new_v4());let pin=WebviewWindowBuilder::new(app,&label,WebviewUrl::App(format!("capture-pin.html?{}",url.query().unwrap_or("")).into()))
        .title("小助手 · 截图贴图").transparent(true).no_redirection_bitmap(true).decorations(false).resizable(false).shadow(false).skip_taskbar(true).always_on_top(true).focused(false).visible(false).build().map_err(|e|e.to_string())?;
    disable_capture_transitions(&pin);
    let result=(||{pin.set_size(tauri::PhysicalSize::new(width,height+controls)).map_err(|e|e.to_string())?;pin.set_position(tauri::PhysicalPosition::new(x,y)).map_err(|e|e.to_string())?;Ok(())})();
    if result.is_err(){let _=pin.destroy();}result
}
