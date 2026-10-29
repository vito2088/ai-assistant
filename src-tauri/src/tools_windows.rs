use super::{CaptureRegion, DisplayInfo, RecordingStatus};
use std::{path::PathBuf, time::{Duration, SystemTime, UNIX_EPOCH}};
use windows_capture::{
    capture::{CaptureControl, Context, GraphicsCaptureApiHandler},
    encoder::{AudioSettingsBuilder, ContainerSettingsBuilder, VideoEncoder, VideoSettingsBuilder, VideoSettingsSubType},
    frame::Frame, graphics_capture_api::{GraphicsCaptureApi, InternalCaptureControl}, monitor::Monitor,
    settings::{ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings, MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings},
};

type CaptureError = Box<dyn std::error::Error + Send + Sync>;

pub fn displays() -> Result<Vec<DisplayInfo>, String> {
    Monitor::enumerate().map_err(|e| e.to_string())?.into_iter().map(|m| Ok(DisplayInfo {
        id: m.index().map_err(|e| e.to_string())?, name: m.name().unwrap_or_else(|_| "显示器".into()),
        width: m.width().map_err(|e| e.to_string())?, height: m.height().map_err(|e| e.to_string())?,
    })).collect()
}

pub struct CaptureFlags { path: PathBuf, width: u32, height: u32, region: Option<CaptureRegion>, fps: u32 }
pub struct Capture {
    encoder: Option<VideoEncoder>,
    frames: u64,
    region: Option<CaptureRegion>,
    fps: u32,
    started: std::time::Instant,
    paused: Option<std::time::Instant>,
    pause_time: Duration,
    buffer: Vec<u8>,
    bottom_up: Vec<u8>,
    last_frame: std::time::Instant,
}

impl GraphicsCaptureApiHandler for Capture {
    type Flags = CaptureFlags;
    type Error = CaptureError;
    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let flags = ctx.flags;
        let encoder = Some(VideoEncoder::new(
            VideoSettingsBuilder::new(flags.width, flags.height).sub_type(VideoSettingsSubType::H264).frame_rate(flags.fps).bitrate(8_000_000),
            AudioSettingsBuilder::default().disabled(true), ContainerSettingsBuilder::default(), &flags.path,
        )?);
        Ok(Self { encoder, frames: 0, region: flags.region, fps: flags.fps, started: std::time::Instant::now(), paused: None, pause_time: Duration::ZERO, buffer: Vec::new(), bottom_up: Vec::new(), last_frame: std::time::Instant::now() })
    }
    fn on_frame_arrived(&mut self, frame: &mut Frame, _control: InternalCaptureControl) -> Result<(), Self::Error> {
        if let Some(encoder) = &mut self.encoder {
            if self.paused.is_some() || (self.frames > 0 && self.last_frame.elapsed() < Duration::from_millis(1000 / self.fps as u64)) { return Ok(()); }
            let timestamp = self.started.elapsed().saturating_sub(self.pause_time).as_nanos() / 100;
            let pixels = if let Some(r) = self.region { frame.buffer_crop(r.x, r.y, r.x + r.width, r.y + r.height)? } else { frame.buffer()? };
            let stride = pixels.width() as usize * 4;
            let packed = pixels.as_nopadding_buffer(&mut self.buffer);
            // Media Foundation's raw BGRA path is bottom-up, unlike the captured texture.
            flip_rows(packed, stride, &mut self.bottom_up);
            encoder.send_frame_buffer(&self.bottom_up, timestamp as i64)?;
            self.frames += 1;
            self.last_frame = std::time::Instant::now();
        }
        Ok(())
    }
}

fn start(display_id: usize, path: PathBuf, region: Option<CaptureRegion>, fps: u32, show_cursor: bool) -> Result<CaptureControl<Capture, CaptureError>, String> {
    let monitor = Monitor::from_index(display_id).map_err(|e| e.to_string())?;
    let width = monitor.width().map_err(|e| e.to_string())?;
    let height = monitor.height().map_err(|e| e.to_string())?;
    let region = region.map(|r| r.checked(width, height)).transpose()?;
    let flags = CaptureFlags { width: region.map_or(width, |r| r.width), height: region.map_or(height, |r| r.height), path, region, fps };
    let cursor = if GraphicsCaptureApi::is_cursor_settings_supported().unwrap_or(false) {
        if !show_cursor { CursorCaptureSettings::WithoutCursor } else { CursorCaptureSettings::WithCursor }
    } else { CursorCaptureSettings::Default };
    let interval = if GraphicsCaptureApi::is_minimum_update_interval_supported().unwrap_or(false) {
        MinimumUpdateIntervalSettings::Custom(Duration::from_millis(1000 / fps as u64))
    } else { MinimumUpdateIntervalSettings::Default };
    Capture::start_free_threaded(Settings::new(monitor,
        cursor,
        DrawBorderSettings::Default, SecondaryWindowSettings::Default,
        interval, DirtyRegionSettings::Default, ColorFormat::Bgra8, flags,
    )).map_err(|e| e.to_string())
}

#[derive(Default)]
pub struct RecordingState {
    control: Option<CaptureControl<Capture, CaptureError>>,
    status: RecordingStatus,
}

impl RecordingState {
    pub fn start(&mut self, display_id: usize, path: PathBuf, region: Option<CaptureRegion>, fps: u32, cursor: bool) -> Result<RecordingStatus, String> {
        if self.control.is_some() { return Err("已有录屏进行中，请先停止并保存".into()); }
        let control = start(display_id, path.clone(), region, fps, cursor)?;
        self.control = Some(control);
        self.status = RecordingStatus { active: true, started_at: SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64, path: path.to_string_lossy().into(), error: None, paused: false };
        Ok(self.status())
    }
    pub fn status(&self) -> RecordingStatus {
        let mut status = self.status.clone();
        if self.control.as_ref().is_some_and(|control| control.is_finished()) {
            status.error = Some("录屏来源已结束，正在保存".into());
        }
        status
    }
    pub fn pause(&mut self, paused: bool) -> Result<RecordingStatus, String> {
        let control = self.control.as_ref().ok_or("No active recording")?;
        let callback = control.callback();
        let mut capture = callback.lock();
        if paused && capture.paused.is_none() { capture.paused = Some(std::time::Instant::now()); }
        if !paused { if let Some(at) = capture.paused.take() {
            let duration = at.elapsed(); capture.pause_time += duration;
            self.status.started_at += duration.as_millis() as u64;
        } }
        self.status.paused = paused;
        Ok(self.status())
    }
    pub fn stop(&mut self) -> Result<RecordingStatus, String> {
        let Some(control) = self.control.take() else { return Ok(self.status()); };
        let callback = control.callback();
        let stopped = control.stop().map_err(|e| e.to_string());
        let mut capture = callback.lock();
        let finished = capture.encoder.take().map(|e| e.finish().map_err(|e| e.to_string())).unwrap_or(Ok(()));
        let result = stopped.and(finished).and_then(|_| if capture.frames > 0 { Ok(()) } else { Err("未录到画面，请重试并检查屏幕权限".into()) });
        self.status.active = false;
        self.status.paused = false;
        self.status.error = result.err();
        if let Some(error) = &self.status.error { return Err(error.clone()); }
        Ok(self.status())
    }
}

fn flip_rows(source: &[u8], stride: usize, output: &mut Vec<u8>) {
    output.resize(source.len(), 0);
    for (input, target) in source.chunks_exact(stride).rev().zip(output.chunks_exact_mut(stride)) { target.copy_from_slice(input); }
}

#[cfg(test)]
mod tests {
    #[test]
    fn raw_video_rows_flip_without_swapping_pixels_or_channels() {
        let source: Vec<u8> = (0..16).collect();
        let mut output = Vec::new();
        super::flip_rows(&source, 8, &mut output);
        assert_eq!(output, [8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7]);
    }
}
