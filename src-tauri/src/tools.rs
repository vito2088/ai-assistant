use serde::{Serialize, Deserialize};
use std::{collections::HashMap, fs::File, io::Write, path::PathBuf, sync::Mutex};
use tauri::{ipc::{InvokeBody, Request, Response}, AppHandle, Emitter, Manager, State};
use uuid::Uuid;

#[cfg(windows)]
#[path = "tools_windows.rs"]
mod native;

#[cfg(windows)]
pub fn display_device_name(id: usize) -> Result<String, String> { native::device_name(id) }

#[tauri::command]
pub fn pause_screen_recording(app: AppHandle, paused: bool) -> Result<RecordingStatus, String> {
    #[cfg(windows)]
    {
        let status = app.state::<ToolState>().recording.lock().map_err(|e| e.to_string())?.pause(paused)?;
        let _ = app.emit("tools-recording", &status);
        Ok(status)
    }
    #[cfg(not(windows))]
    { let _ = (app, paused); Err("请在录屏面板暂停".into()) }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayInfo { pub id: usize, pub name: String, pub width: u32, pub height: u32 }

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingStatus {
    pub active: bool,
    pub started_at: u64,
    pub path: String,
    pub error: Option<String>,
    pub paused: bool,
}

#[derive(Clone, Copy, Deserialize, Serialize, Debug)]
pub struct CaptureRegion { pub x: u32, pub y: u32, pub width: u32, pub height: u32 }

impl CaptureRegion {
    pub fn checked(self, width: u32, height: u32) -> Result<Self, String> {
        if self.width < 2 || self.height < 2 || self.x >= width || self.y >= height || self.width > width - self.x || self.height > height - self.y {
            return Err("选区超出屏幕，请重新选择".into());
        }
        Ok(Self { width: self.width & !1, height: self.height & !1, ..self })
    }
}

struct Export { file: File, temporary: PathBuf, destination: PathBuf }

#[derive(Default)]
pub struct ToolState {
    exports: Mutex<HashMap<String, Export>>,
    #[cfg(windows)]
    recording: Mutex<native::RecordingState>,
}

pub fn validate_output(path: &str, extensions: &[&str]) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() || !path.extension().and_then(|v| v.to_str()).is_some_and(|ext| extensions.iter().any(|v| ext.eq_ignore_ascii_case(v))) {
        return Err("请选择有效的保存路径和文件格式".into());
    }
    if !path.parent().is_some_and(|p| p.is_dir()) { return Err("保存目录不存在".into()); }
    Ok(path)
}

#[tauri::command]
pub async fn tool_displays() -> Result<Vec<DisplayInfo>, String> {
    #[cfg(windows)]
    { tauri::async_runtime::spawn_blocking(native::displays).await.map_err(|e| e.to_string())? }
    #[cfg(not(windows))]
    { Ok(Vec::new()) }
}

#[tauri::command]
pub fn native_capture_available() -> bool { cfg!(windows) }

#[tauri::command]
pub async fn capture_screenshot(display_id: usize, path: String) -> Result<Response, String> {
    let output = validate_output(&path, &["png"])?;
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || {
            native::screenshot(display_id, &output)?;
            std::fs::read(output).map(Response::new).map_err(|e| e.to_string())
        }).await.map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    { let _ = (display_id, output); Err("请使用系统屏幕选择器截图".into()) }
}

#[tauri::command]
pub async fn start_screen_recording(app: AppHandle, display_id: usize, path: String, region: Option<CaptureRegion>, fps: Option<u32>, cursor: Option<bool>) -> Result<RecordingStatus, String> {
    let output = validate_output(&path, &["mp4"])?;
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<ToolState>();
            let mut recording = state.recording.lock().map_err(|e| e.to_string())?;
            let status = recording.start(display_id, output, region, fps.unwrap_or(30).clamp(15, 60), cursor.unwrap_or(true))?;
            drop(recording);
            let _ = super::set_tray_recording(app.clone(), true);
            let _ = app.emit("tools-recording", &status);
            Ok(status)
        }).await.map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    { let _ = (app, display_id, output); Err("请使用系统屏幕选择器录屏".into()) }
}

pub fn stop_recording(app: &AppHandle) -> Result<RecordingStatus, String> {
    #[cfg(windows)]
    {
        let state = app.state::<ToolState>();
        let result = state.recording.lock().map_err(|e| e.to_string())?.stop();
        let status = state.recording.lock().map_err(|e| e.to_string())?.status();
        let _ = super::set_tray_recording(app.clone(), false);
        let _ = app.emit("tools-recording", &status);
        result
    }
    #[cfg(not(windows))]
    { let _ = app; Ok(RecordingStatus::default()) }
}

#[tauri::command]
pub async fn stop_screen_recording(app: AppHandle) -> Result<RecordingStatus, String> {
    tauri::async_runtime::spawn_blocking(move || stop_recording(&app)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn screen_recording_status(state: State<'_, ToolState>) -> Result<RecordingStatus, String> {
    #[cfg(windows)]
    { Ok(state.recording.lock().map_err(|e| e.to_string())?.status()) }
    #[cfg(not(windows))]
    { let _ = state; Ok(RecordingStatus::default()) }
}

// Browser capture writes bounded binary chunks instead of holding an entire video in memory.
#[tauri::command]
pub fn begin_tool_export(state: State<'_, ToolState>, path: String) -> Result<String, String> {
    let destination = validate_output(&path, &["png", "webm", "mp4"])?;
    let id = Uuid::new_v4().to_string();
    let temporary = destination.with_file_name(format!(".assistant-{id}.part"));
    let file = File::create(&temporary).map_err(|e| e.to_string())?;
    state.exports.lock().map_err(|e| e.to_string())?.insert(id.clone(), Export { file, temporary, destination });
    Ok(id)
}

#[tauri::command]
pub fn append_tool_export(state: State<'_, ToolState>, request: Request<'_>) -> Result<(), String> {
    let id = request.headers().get("x-export-id").and_then(|v| v.to_str().ok()).ok_or("缺少保存任务")?;
    let InvokeBody::Raw(bytes) = request.body() else { return Err("无效的文件数据".into()); };
    if bytes.len() > 8 * 1024 * 1024 { return Err("文件分块过大".into()); }
    let mut exports = state.exports.lock().map_err(|e| e.to_string())?;
    let export = exports.get_mut(id).ok_or("保存任务已结束")?;
    export.file.write_all(bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn finish_tool_export(state: State<'_, ToolState>, id: String, discard: bool) -> Result<(), String> {
    let mut exports = state.exports.lock().map_err(|e| e.to_string())?;
    let export = exports.get_mut(&id).ok_or("保存任务已结束")?;
    if !discard {
        export.file.flush().map_err(|e| e.to_string())?;
        std::fs::copy(&export.temporary, &export.destination).map_err(|e| e.to_string())?;
    }
    let export = exports.remove(&id).unwrap();
    drop(export.file);
    std::fs::remove_file(export.temporary).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_tool_output(path: String) -> Result<(), String> {
    let path = validate_output(&path, &["png", "mp4", "webm"])?;
    if !path.is_file() { return Err("文件尚未保存或已被移动".into()); }
    #[cfg(windows)]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(not(any(windows, target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command.arg(path.parent().unwrap()).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod capture_tests {
    use super::CaptureRegion;
    #[test]
    fn region_rejects_out_of_bounds_and_normalizes_encoder_dimensions() {
        let valid = CaptureRegion { x: 5, y: 7, width: 101, height: 99 }.checked(1920, 1080).unwrap();
        assert_eq!((valid.x, valid.y, valid.width, valid.height), (5, 7, 100, 98));
        for region in [
            CaptureRegion { x: 0, y: 0, width: 1, height: 10 },
            CaptureRegion { x: 1910, y: 0, width: 20, height: 10 },
            CaptureRegion { x: u32::MAX, y: 0, width: 20, height: 10 },
            CaptureRegion { x: 0, y: 1080, width: 20, height: 10 },
        ] { assert!(region.checked(1920, 1080).is_err()); }
    }
}
