//! A single desktop copy, without opening a Windows Graphics Capture session.
use windows::Win32::Graphics::Gdi::*;
use windows_capture::monitor::Monitor;

struct Bitmap {
    screen: HDC,
    memory: HDC,
    bitmap: HBITMAP,
    previous: HGDIOBJ,
}
impl Drop for Bitmap {
    fn drop(&mut self) {
        unsafe {
            if !self.previous.0.is_null() && self.previous.0 as isize != -1 { let _=SelectObject(self.memory,self.previous); }
            if !self.bitmap.0.is_null() { let _=DeleteObject(HGDIOBJ(self.bitmap.0)); }
            if !self.memory.0.is_null() { let _=DeleteDC(self.memory); }
            if !self.screen.0.is_null() { ReleaseDC(None,self.screen); }
        }
    }
}

pub struct DesktopFrame { pub x: i32, pub y: i32, pub width: u32, pub height: u32, pub bgra: Vec<u8> }

pub fn capture(display_id: usize) -> Result<DesktopFrame,String> {
    let monitor=Monitor::from_index(display_id).map_err(|e|e.to_string())?;
    let mut info=MONITORINFO {cbSize:std::mem::size_of::<MONITORINFO>() as u32,..Default::default()};
    // All handles and the DIB pointer stay on this thread and are released on every exit path.
    unsafe {
        if !GetMonitorInfoW(HMONITOR(monitor.as_raw_hmonitor()), &mut info).as_bool() { return Err("无法读取显示器坐标".into()); }
        let width=info.rcMonitor.right-info.rcMonitor.left;
        let height=info.rcMonitor.bottom-info.rcMonitor.top;
        let length=(width as usize).checked_mul(height as usize).and_then(|n|n.checked_mul(4)).filter(|n|*n<=512*1024*1024).ok_or("显示器尺寸超出截图限制")?;
        if width<=0 || height<=0 {return Err("无效显示器尺寸".into());}
        let mut resources=Bitmap {screen:GetDC(None),memory:HDC::default(),bitmap:HBITMAP::default(),previous:HGDIOBJ::default()};
        if resources.screen.0.is_null() {return Err("无法访问桌面画面".into());}
        resources.memory=CreateCompatibleDC(Some(resources.screen));
        if resources.memory.0.is_null() {return Err("无法创建截图缓冲区".into());}
        let bitmap_info=BITMAPINFO {bmiHeader:BITMAPINFOHEADER {biSize:std::mem::size_of::<BITMAPINFOHEADER>() as u32,biWidth:width,biHeight:-height,biPlanes:1,biBitCount:32,biCompression:BI_RGB.0,..Default::default()},..Default::default()};
        let mut bits=std::ptr::null_mut();
        resources.bitmap=CreateDIBSection(Some(resources.screen),&bitmap_info,DIB_RGB_COLORS,&mut bits,None,0).map_err(|e|e.to_string())?;
        if bits.is_null() {return Err("截图缓冲区为空".into());}
        resources.previous=SelectObject(resources.memory,HGDIOBJ(resources.bitmap.0));
        if resources.previous.0.is_null() || resources.previous.0 as isize == -1 {return Err("无法选择截图缓冲区".into());}
        // Wait for the compositor to present any helper-window hide before the
        // copy, without relying on a throttled timer in the now-hidden WebView.
        let _=windows::Win32::Graphics::Dwm::DwmFlush();
        BitBlt(resources.memory,0,0,width,height,Some(resources.screen),info.rcMonitor.left,info.rcMonitor.top,SRCCOPY|CAPTUREBLT).map_err(|e|e.to_string())?;
        GdiFlush().ok().map_err(|e|e.to_string())?;
        let bytes=std::slice::from_raw_parts(bits.cast::<u8>(),length).to_vec();
        Ok(DesktopFrame {x: info.rcMonitor.left, y: info.rcMonitor.top, width: width as u32, height: height as u32, bgra: bytes})
    }
}

#[cfg(test)]
fn make_rgba(bytes: &mut [u8]) {
    for pixel in bytes.chunks_exact_mut(4) {pixel.swap(0,2);pixel[3]=255;}
}

pub(super) fn encode(bytes: &[u8], width:u32, height:u32) -> Result<Vec<u8>,String> {
    // This temporary source favors latency over compression ratio; final crops
    // are still exported as lossless PNG by the editor.
    let mut encoded=Vec::new();
    {
        let mut encoder=png::Encoder::new(&mut encoded,width,height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_compression(png::Compression::Fastest);
        let mut writer=encoder.write_header().map_err(|e|e.to_string())?;
        writer.write_image_data(bytes).map_err(|e|e.to_string())?;
    }
    Ok(encoded)
}

#[cfg(test)]
mod tests {
    #[test]
    fn png_is_lossless_opaque_and_keeps_top_down_rows_and_color_channels() {
        let mut bgra=vec![0,0,255,0, 0,255,0,0, 255,0,0,128, 255,255,255,0];
        super::make_rgba(&mut bgra);
        let bytes=super::encode(&bgra,2,2).unwrap();
        let mut reader=png::Decoder::new(std::io::Cursor::new(bytes)).read_info().unwrap();
        let mut pixels=vec![0;reader.output_buffer_size().unwrap()];
        let frame=reader.next_frame(&mut pixels).unwrap();
        assert_eq!((frame.width,frame.height),(2,2));
        assert_eq!(pixels,[255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,255,255]);
    }
}
