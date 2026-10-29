//! Shared annotation model and CPU-readable Direct2D export, independent of WebViews.
use super::{desktop_snapshot::DesktopFrame, native_capture::Selection};
use windows::{
    core::w,
    Win32::{
        Graphics::{
            Direct2D::{Common::*, *},
            DirectWrite::*,
            Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM,
            Imaging::*,
        },
        System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER},
    },
};
use windows_numerics::Vector2;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Tool {
    Select,
    Pen,
    Arrow,
    Rectangle,
    Ellipse,
    Text,
    Mosaic,
    Step,
}
#[derive(Clone, Debug)]
pub struct Mark {
    pub tool: Tool,
    pub points: Vec<(f32, f32)>,
    pub color: u32,
    pub width: f32,
    pub text: String,
}
#[derive(Default)]
pub struct History {
    pub marks: Vec<Mark>,
    pub redo: Vec<Mark>,
}
impl History {
    pub fn push(&mut self, mark: Mark) {
        self.marks.push(mark);
        self.redo.clear();
    }
    pub fn undo(&mut self) {
        if let Some(mark) = self.marks.pop() {
            self.redo.push(mark);
        }
    }
    pub fn redo(&mut self) {
        if let Some(mark) = self.redo.pop() {
            self.marks.push(mark);
        }
    }
}
pub struct Image {
    pub width: u32,
    pub height: u32,
    pub bgra: Vec<u8>,
}
impl Image {
    pub fn png(&self) -> Result<Vec<u8>, String> {
        let mut rgba = self.bgra.clone();
        for p in rgba.chunks_exact_mut(4) {
            p.swap(0, 2);
            p[3] = 255;
        }
        super::desktop_snapshot::encode(&rgba, self.width, self.height)
    }
}
pub fn point(x: f32, y: f32) -> Vector2 {
    Vector2 { X: x, Y: y }
}
pub fn area(x: f32, y: f32, width: f32, height: f32) -> D2D_RECT_F {
    D2D_RECT_F {
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
    }
}
pub fn color(rgb: u32) -> D2D1_COLOR_F {
    D2D1_COLOR_F {
        r: ((rgb >> 16) & 255) as f32 / 255.0,
        g: ((rgb >> 8) & 255) as f32 / 255.0,
        b: (rgb & 255) as f32 / 255.0,
        a: 1.0,
    }
}
pub unsafe fn brush(target: &ID2D1RenderTarget, rgb: u32) -> Result<ID2D1SolidColorBrush, String> {
    target
        .CreateSolidColorBrush(&color(rgb), None)
        .map_err(|e| e.to_string())
}
pub unsafe fn text_format(size: f32, center: bool) -> Result<IDWriteTextFormat, String> {
    let factory: IDWriteFactory =
        DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED).map_err(|e| e.to_string())?;
    let f = factory
        .CreateTextFormat(
            w!("Microsoft YaHei UI"),
            None,
            DWRITE_FONT_WEIGHT_SEMI_BOLD,
            DWRITE_FONT_STYLE_NORMAL,
            DWRITE_FONT_STRETCH_NORMAL,
            size,
            w!("zh-CN"),
        )
        .map_err(|e| e.to_string())?;
    if center {
        f.SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER)
            .map_err(|e| e.to_string())?;
        f.SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER)
            .map_err(|e| e.to_string())?;
    } else {
        f.SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP)
            .map_err(|e| e.to_string())?;
    }
    Ok(f)
}
pub unsafe fn bitmap(
    target: &ID2D1RenderTarget,
    frame: &DesktopFrame,
) -> Result<ID2D1Bitmap, String> {
    target
        .CreateBitmap(
            D2D_SIZE_U {
                width: frame.width,
                height: frame.height,
            },
            Some(frame.bgra.as_ptr().cast()),
            frame.width * 4,
            &D2D1_BITMAP_PROPERTIES {
                pixelFormat: D2D1_PIXEL_FORMAT {
                    format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    alphaMode: D2D1_ALPHA_MODE_IGNORE,
                },
                dpiX: 96.0,
                dpiY: 96.0,
            },
        )
        .map_err(|e| e.to_string())
}

pub unsafe fn draw_mark(
    target: &ID2D1RenderTarget,
    frame: &DesktopFrame,
    mark: &Mark,
    offset: (f32, f32),
) -> Result<(), String> {
    let Some(first) = mark.points.first() else {
        return Ok(());
    };
    let last = mark.points.last().unwrap();
    let a = (first.0 - offset.0, first.1 - offset.1);
    let b = (last.0 - offset.0, last.1 - offset.1);
    let rect = area(
        a.0.min(b.0),
        a.1.min(b.1),
        (a.0 - b.0).abs(),
        (a.1 - b.1).abs(),
    );
    let ink = brush(target, mark.color)?;
    match mark.tool {
        Tool::Select => {}
        Tool::Rectangle => target.DrawRectangle(&rect, &ink, mark.width, None),
        Tool::Ellipse => target.DrawEllipse(
            &D2D1_ELLIPSE {
                point: point((a.0 + b.0) / 2.0, (a.1 + b.1) / 2.0),
                radiusX: rect.right - rect.left,
                radiusY: rect.bottom - rect.top,
            }
            .half(),
            &ink,
            mark.width,
            None,
        ),
        Tool::Text => {
            let format = text_format(mark.width * 5.0 + 16.0, false)?;
            target.DrawText(
                &mark.text.encode_utf16().collect::<Vec<_>>(),
                &format,
                &area(
                    a.0,
                    a.1,
                    frame.width as f32 + offset.0,
                    frame.height as f32 + offset.1,
                ),
                &ink,
                D2D1_DRAW_TEXT_OPTIONS_NONE,
                DWRITE_MEASURING_MODE_NATURAL,
            );
        }
        Tool::Step => {
            let radius = mark.width * 2.0 + 14.0;
            target.FillEllipse(
                &D2D1_ELLIPSE {
                    point: point(a.0, a.1),
                    radiusX: radius,
                    radiusY: radius,
                },
                &ink,
            );
            let white = brush(target, 0xffffff)?;
            let format = text_format(radius, true)?;
            target.DrawText(
                &mark.text.encode_utf16().collect::<Vec<_>>(),
                &format,
                &area(a.0 - radius, a.1 - radius, 2.0 * radius, 2.0 * radius),
                &white,
                D2D1_DRAW_TEXT_OPTIONS_NONE,
                DWRITE_MEASURING_MODE_NATURAL,
            );
        }
        Tool::Mosaic => {
            let x = first.0.min(last.0).clamp(0.0, frame.width as f32) as u32;
            let y = first.1.min(last.1).clamp(0.0, frame.height as f32) as u32;
            let w = ((first.0 - last.0).abs() as u32).min(frame.width - x);
            let h = ((first.1 - last.1).abs() as u32).min(frame.height - y);
            if w == 0 || h == 0 {
                return Ok(());
            }
            let pw = w.div_ceil(18).max(1);
            let ph = h.div_ceil(18).max(1);
            let mut pixels = Vec::with_capacity((pw * ph * 4) as usize);
            for yy in 0..ph {
                for xx in 0..pw {
                    let sx = (x + ((xx as f32 + 0.5) * w as f32 / pw as f32) as u32)
                        .min(frame.width - 1);
                    let sy = (y + ((yy as f32 + 0.5) * h as f32 / ph as f32) as u32)
                        .min(frame.height - 1);
                    let at = ((sy * frame.width + sx) * 4) as usize;
                    pixels.extend_from_slice(&frame.bgra[at..at + 4]);
                }
            }
            let pixel = target
                .CreateBitmap(
                    D2D_SIZE_U {
                        width: pw,
                        height: ph,
                    },
                    Some(pixels.as_ptr().cast()),
                    pw * 4,
                    &D2D1_BITMAP_PROPERTIES {
                        pixelFormat: D2D1_PIXEL_FORMAT {
                            format: DXGI_FORMAT_B8G8R8A8_UNORM,
                            alphaMode: D2D1_ALPHA_MODE_IGNORE,
                        },
                        dpiX: 96.0,
                        dpiY: 96.0,
                    },
                )
                .map_err(|e| e.to_string())?;
            target.DrawBitmap(
                &pixel,
                Some(&rect),
                1.0,
                D2D1_BITMAP_INTERPOLATION_MODE_NEAREST_NEIGHBOR,
                None,
            );
        }
        Tool::Pen | Tool::Arrow => {
            for pair in mark.points.windows(2) {
                target.DrawLine(
                    point(pair[0].0 - offset.0, pair[0].1 - offset.1),
                    point(pair[1].0 - offset.0, pair[1].1 - offset.1),
                    &ink,
                    mark.width,
                    None,
                );
            }
            if mark.tool == Tool::Arrow {
                let angle = (b.1 - a.1).atan2(b.0 - a.0);
                let length = mark.width * 4.0 + 12.0;
                for delta in [-0.45, 0.45] {
                    target.DrawLine(
                        point(b.0, b.1),
                        point(
                            b.0 - length * (angle + delta).cos(),
                            b.1 - length * (angle + delta).sin(),
                        ),
                        &ink,
                        mark.width,
                        None,
                    );
                }
            }
        }
    }
    Ok(())
}
trait HalfEllipse {
    fn half(self) -> Self;
}
impl HalfEllipse for D2D1_ELLIPSE {
    fn half(mut self) -> Self {
        self.radiusX /= 2.0;
        self.radiusY /= 2.0;
        self
    }
}

fn validate(frame: &DesktopFrame, s: Selection) -> Result<(), String> {
    if s.width < 2
        || s.height < 2
        || s.x >= frame.width
        || s.y >= frame.height
        || s.width > frame.width - s.x
        || s.height > frame.height - s.y
    {
        return Err("无效截图选区".into());
    }
    Ok(())
}
pub fn crop(frame: &DesktopFrame, s: Selection) -> Result<Image, String> {
    validate(frame, s)?;
    let mut bytes = Vec::with_capacity((s.width * s.height * 4) as usize);
    for row in s.y..s.y + s.height {
        let at = ((row * frame.width + s.x) * 4) as usize;
        bytes.extend_from_slice(&frame.bgra[at..at + (s.width * 4) as usize]);
    }
    for pixel in bytes.chunks_exact_mut(4) {
        pixel[3] = 255;
    }
    Ok(Image {
        width: s.width,
        height: s.height,
        bgra: bytes,
    })
}
pub unsafe fn render(frame: &DesktopFrame, s: Selection, marks: &[Mark]) -> Result<Image, String> {
    if marks.is_empty() {
        return crop(frame, s);
    }
    validate(frame, s)?;
    let wic: IWICImagingFactory =
        CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)
            .map_err(|e| e.to_string())?;
    let image = wic
        .CreateBitmap(
            s.width,
            s.height,
            &GUID_WICPixelFormat32bppPBGRA,
            WICBitmapCacheOnLoad,
        )
        .map_err(|e| e.to_string())?;
    let factory: ID2D1Factory =
        D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, None).map_err(|e| e.to_string())?;
    let target = factory
        .CreateWicBitmapRenderTarget(
            &image,
            &D2D1_RENDER_TARGET_PROPERTIES {
                r#type: D2D1_RENDER_TARGET_TYPE_SOFTWARE,
                dpiX: 96.0,
                dpiY: 96.0,
                ..Default::default()
            },
        )
        .map_err(|e| e.to_string())?;
    let base = bitmap(&target, frame)?;
    target.BeginDraw();
    target.DrawBitmap(
        &base,
        Some(&area(
            -(s.x as f32),
            -(s.y as f32),
            frame.width as f32,
            frame.height as f32,
        )),
        1.0,
        D2D1_BITMAP_INTERPOLATION_MODE_NEAREST_NEIGHBOR,
        None,
    );
    for mark in marks {
        draw_mark(&target, frame, mark, (s.x as f32, s.y as f32))?;
    }
    target.EndDraw(None, None).map_err(|e| e.to_string())?;
    let lock = image
        .Lock(
            &WICRect {
                X: 0,
                Y: 0,
                Width: s.width as i32,
                Height: s.height as i32,
            },
            WICBitmapLockRead.0 as u32,
        )
        .map_err(|e| e.to_string())?;
    let stride = lock.GetStride().map_err(|e| e.to_string())? as usize;
    let mut size = 0;
    let mut ptr = std::ptr::null_mut();
    lock.GetDataPointer(&mut size, &mut ptr)
        .map_err(|e| e.to_string())?;
    if ptr.is_null() || (size as usize) < stride * s.height as usize {
        return Err("无法读取标注图像".into());
    }
    let source = std::slice::from_raw_parts(ptr, size as usize);
    let mut output = Vec::with_capacity((s.width * s.height * 4) as usize);
    for row in 0..s.height as usize {
        output.extend_from_slice(&source[row * stride..row * stride + s.width as usize * 4]);
    }
    for pixel in output.chunks_exact_mut(4) {
        pixel[3] = 255;
    }
    Ok(Image {
        width: s.width,
        height: s.height,
        bgra: output,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn annotated_export_keeps_crop_coordinates_and_renders_every_tool() {
        use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok().unwrap();
            let frame = DesktopFrame { x: -400, y: 100, width: 320, height: 220, bgra: [32, 96, 192, 255].repeat(320*220) };
            let selection = Selection { x: 40, y: 20, width: 240, height: 180 };
            for tool in [Tool::Pen, Tool::Arrow, Tool::Rectangle, Tool::Ellipse, Tool::Text, Tool::Step] {
                let mark = Mark {tool, points: vec![(70.0, 60.0), (200.0, 150.0)], color: 0x00ff00, width: 4.0, text: "原生 Test 1".into()};
                let image = render(&frame, selection, &[mark]).unwrap();
                assert_eq!((image.width,image.height),(240,180));
                assert_eq!(&image.bgra[..4], &[32,96,192,255], "background offset: {tool:?}");
                assert!(image.bgra.chunks_exact(4).any(|p|p[1]>150 && p[0]<25 && p[2]<25), "missing mark: {tool:?}");
                assert!(image.bgra.chunks_exact(4).all(|p|p[3]==255));
            }
            let mut gradient = frame;
            for (i,p) in gradient.bgra.chunks_exact_mut(4).enumerate() {p[0]=(i%320)as u8; p[1]=(i/320)as u8;}
            let mark = Mark {tool:Tool::Mosaic,points:vec![(70.0,60.0),(200.0,150.0)],color:0,width:4.0,text:String::new()};
            let mosaic = render(&gradient,selection,&[mark]).unwrap();
            let at = ((65-20)*240+(75-40))*4;
            assert_eq!(&mosaic.bgra[at..at+4],&mosaic.bgra[at+4..at+8]);
            assert_ne!(&mosaic.bgra[at..at+4],&crop(&gradient,selection).unwrap().bgra[at..at+4]);
            CoUninitialize();
        }
    }
    #[test]
    fn undo_redo_and_new_mark_replace_the_redo_branch() {
        let mark = Mark {
            tool: Tool::Pen,
            points: vec![(1.0, 1.0)],
            color: 0xff0000,
            width: 2.0,
            text: String::new(),
        };
        let mut h = History::default();
        h.push(mark.clone());
        h.undo();
        assert!(h.marks.is_empty());
        h.redo();
        assert_eq!(h.marks.len(), 1);
        h.undo();
        h.push(mark);
        assert!(h.redo.is_empty());
    }
    #[test]
    fn crop_uses_physical_top_down_pixels() {
        let f = DesktopFrame {
            x: -10,
            y: 0,
            width: 3,
            height: 2,
            bgra: (0..24).collect(),
        };
        let i = crop(
            &f,
            Selection {
                x: 1,
                y: 0,
                width: 2,
                height: 2,
            },
        )
        .unwrap();
        assert_eq!(
            i.bgra,
            [4, 5, 6, 255, 8, 9, 10, 255, 16, 17, 18, 255, 20, 21, 22, 255]
        );
    }
}
