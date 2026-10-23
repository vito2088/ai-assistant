//! Local drafts survive a cancelled save dialog and an application restart.
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Emitter, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

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
    tauri::async_runtime::spawn_blocking(move || std::fs::read(path).map(tauri::ipc::Response::new).map_err(|e| e.to_string())).await.map_err(|e| e.to_string())?
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
pub async fn open_capture_overlay(app: AppHandle, display_id: usize, path: String, mode: String, countdown: u32) -> Result<(), String> {
    checked(&app, &path)?;
    if !["screenshot", "recording"].contains(&mode.as_str()) { return Err("无效捕获模式".into()); }
    if app.get_webview_window("capture").is_some() { return Err("请先完成当前截图或录屏".into()); }
    let main = app.get_webview_window("main").ok_or("主窗口不可用")?;
    let monitors = main.available_monitors().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let name = super::tools::display_device_name(display_id)?;
    #[cfg(not(windows))]
    let name = String::new();
    let monitor = monitors.iter().find(|m| m.name().is_some_and(|n| n == &name)).or_else(|| monitors.first()).ok_or("没有可用的显示器")?;
    let mut url = tauri::Url::parse("http://localhost/capture.html").map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("path", &path).append_pair("mode", &mode).append_pair("countdown", &countdown.min(10).to_string());
    let overlay = WebviewWindowBuilder::new(&app, "capture", WebviewUrl::App(format!("capture.html?{}", url.query().unwrap_or("")).into()))
        .title("小助手 · 屏幕捕获").decorations(false).resizable(false).shadow(false).skip_taskbar(true).always_on_top(true).visible(false).build().map_err(|e| e.to_string())?;
    overlay.set_position(*monitor.position()).map_err(|e| e.to_string())?;
    overlay.set_size(*monitor.size()).map_err(|e| e.to_string())?;
    overlay.set_content_protected(true).map_err(|e| e.to_string())?;
    overlay.show().map_err(|e| e.to_string())?;
    overlay.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn close_capture_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("capture-border") { w.destroy().map_err(|e| e.to_string())?; }
    if let Some(w) = app.get_webview_window("capture") { w.destroy().map_err(|e| e.to_string())?; }
    Ok(())
}
#[tauri::command]
pub async fn show_recording_border(app: AppHandle, region: super::tools::CaptureRegion) -> Result<(), String> {
    let overlay = app.get_webview_window("capture").ok_or("选区窗口已关闭")?;
    let monitor = overlay.current_monitor().map_err(|e| e.to_string())?.ok_or("显示器不可用")?;
    let region = region.checked(monitor.size().width, monitor.size().height)?;
    let border = WebviewWindowBuilder::new(&app, "capture-border", WebviewUrl::App("capture-border.html".into()))
        .title("录制区域").transparent(true).decorations(false).shadow(false).resizable(false).skip_taskbar(true).always_on_top(true).focused(false).visible(false).build().map_err(|e| e.to_string())?;
    border.set_position(tauri::PhysicalPosition::new(monitor.position().x + region.x as i32, monitor.position().y + region.y as i32)).map_err(|e| e.to_string())?;
    border.set_size(tauri::PhysicalSize::new(region.width, region.height)).map_err(|e| e.to_string())?;
    border.set_content_protected(true).map_err(|e| e.to_string())?;
    border.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
    border.show().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn capture_toolbar(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("capture") {
        let m = w.current_monitor().map_err(|e| e.to_string())?.ok_or("显示器不可用")?;
        w.hide().map_err(|e| e.to_string())?;
        w.set_size(tauri::LogicalSize::new(340.0, 64.0)).map_err(|e| e.to_string())?;
        w.set_position(tauri::PhysicalPosition::new(m.position().x + 20, m.position().y + 20)).map_err(|e| e.to_string())?;
        w.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn cancel_on_close(app: &AppHandle) { let _ = app.emit("capture-cancel", ()); }

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
    let overlay = app.get_webview_window("capture").ok_or("截图窗口已关闭")?;
    let origin = overlay.inner_position().map_err(|e| e.to_string())?;
    let screen = overlay.inner_size().map_err(|e| e.to_string())?;
    let scale = overlay.scale_factor().map_err(|e| e.to_string())?;
    // Keep controls reachable for tiny selections, and keep large captures inside the display.
    let width = (bounds.width * screen.width as f64).max(150.0 * scale).min(screen.width as f64).round() as u32;
    let height = (bounds.height * screen.height as f64).max(80.0 * scale).min(screen.height as f64).round() as u32;
    let x = origin.x + ((bounds.x * screen.width as f64).round() as i32).min(screen.width.saturating_sub(width) as i32);
    let y = origin.y + ((bounds.y * screen.height as f64).round() as i32).min(screen.height.saturating_sub(height) as i32);
    let mut url = tauri::Url::parse("http://localhost/capture-pin.html").map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("path", &path);
    let label = format!("capture-pin-{}", Uuid::new_v4());
    let pinned = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(format!("capture-pin.html?{}", url.query().unwrap_or("")).into()))
        .title("小助手 · 截图贴图").decorations(false).resizable(false).shadow(false).skip_taskbar(true).always_on_top(true).visible(false).build().map_err(|e| e.to_string())?;
    let result = (|| {
        pinned.set_size(tauri::PhysicalSize::new(width, height)).map_err(|e| e.to_string())?;
        pinned.set_position(tauri::PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        pinned.show().map_err(|e| e.to_string())?;
        pinned.set_focus().map_err(|e| e.to_string())?;
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
