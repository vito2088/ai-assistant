//! Native Windows capture editor and recording controls. No capture WebView.
use super::{
    desktop_snapshot::{self, DesktopFrame},
    native_capture_service::{self as service, Kind, Message, Options},
    native_editor::{self as editor, area, point, History, Image, Mark, Tool},
    tools::{NativeCaptureResult, RecordingStatus},
};
use serde::{Deserialize, Serialize};
use std::{
    cell::RefCell,
    sync::{
        atomic::{AtomicBool, Ordering},
        OnceLock,
    },
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};
use windows::Win32::UI::Controls::{EM_SETLIMITTEXT, WM_MOUSELEAVE};
use windows::{
    core::{w, HSTRING, PCWSTR},
    Win32::{
        Foundation::{
            GlobalFree, COLORREF, HANDLE, HGLOBAL, HINSTANCE, HWND, LPARAM, LRESULT, POINT, WPARAM,
        },
        Graphics::{
            Direct2D::{Common::*, *},
            DirectWrite::*,
            Dwm::{DwmFlush, DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED},
            Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM,
            Gdi::*,
        },
        System::{
            Com::{
                CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
            },
            DataExchange::{
                CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW,
                SetClipboardData,
            },
            LibraryLoader::GetModuleHandleW,
            Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT},
        },
        UI::{
            Controls::Dialogs::{ChooseColorW, CC_FULLOPEN, CC_RGBINIT, CHOOSECOLORW},
            HiDpi::{
                GetDpiForWindow, SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT,
                DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
            },
            Input::KeyboardAndMouse::{
                GetKeyState, ReleaseCapture, SetCapture, SetFocus, TrackMouseEvent, TME_LEAVE,
                TRACKMOUSEEVENT, VK_CONTROL, VK_SHIFT,
            },
            Shell::{
                Common::COMDLG_FILTERSPEC, FileSaveDialog, IFileSaveDialog, IShellItem,
                SHCreateItemFromParsingName, FOS_FORCEFILESYSTEM, FOS_OVERWRITEPROMPT,
                FOS_PATHMUSTEXIST, SIGDN_FILESYSPATH,
            },
            WindowsAndMessaging::*,
        },
    },
};

static ACTIVE: AtomicBool = AtomicBool::new(false);
static CLASS: OnceLock<Result<u16, String>> = OnceLock::new();
static BORDER_CLASS: OnceLock<Result<u16, String>> = OnceLock::new();
const COUNTDOWN: usize = 1;
const OCR_TIMER: usize = 2;
const CLOCK: usize = 3;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub(super) struct Selection {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}
impl Selection {
    fn between(a: (i32, i32), b: (i32, i32), w: u32, h: u32) -> Option<Self> {
        let (ax, ay) = (a.0.clamp(0, w as i32) as u32, a.1.clamp(0, h as i32) as u32);
        let (bx, by) = (b.0.clamp(0, w as i32) as u32, b.1.clamp(0, h as i32) as u32);
        let v = Self {
            x: ax.min(bx),
            y: ay.min(by),
            width: ax.abs_diff(bx),
            height: ay.abs_diff(by),
        };
        (v.width >= 2 && v.height >= 2).then_some(v)
    }
    fn contains(self, p: (i32, i32)) -> bool {
        p.0 >= self.x as i32
            && p.1 >= self.y as i32
            && p.0 < (self.x + self.width) as i32
            && p.1 < (self.y + self.height) as i32
    }
    fn rect(self) -> D2D_RECT_F {
        area(
            self.x as f32,
            self.y as f32,
            self.width as f32,
            self.height as f32,
        )
    }
}
#[derive(Clone, Copy, PartialEq)]
enum Action {
    Full,
    Last,
    Select,
    Pen,
    Arrow,
    Rectangle,
    Ellipse,
    Text,
    Mosaic,
    Step,
    Color,
    Width,
    Undo,
    Redo,
    Pin,
    Ocr,
    Translate,
    Save,
    Cancel,
    Done,
    Pause,
    Stop,
    CopyText,
    CopyTranslation,
    ClosePanel,
}
impl Action {
    fn tool(self) -> Option<Tool> {
        Some(match self {
            Self::Select => Tool::Select,
            Self::Pen => Tool::Pen,
            Self::Arrow => Tool::Arrow,
            Self::Rectangle => Tool::Rectangle,
            Self::Ellipse => Tool::Ellipse,
            Self::Text => Tool::Text,
            Self::Mosaic => Tool::Mosaic,
            Self::Step => Tool::Step,
            _ => return None,
        })
    }
    fn icon(self) -> &'static str {
        match self {
            Self::Full => "full",
            Self::Last => "last",
            Self::Select => "select",
            Self::Pen => "pen",
            Self::Arrow => "arrow",
            Self::Rectangle => "rectangle",
            Self::Ellipse => "ellipse",
            Self::Text => "text",
            Self::Mosaic => "mosaic",
            Self::Step => "step",
            Self::Undo => "undo",
            Self::Redo => "redo",
            Self::Pin => "pin",
            Self::Ocr => "ocr",
            Self::Translate => "translate",
            Self::Save => "save",
            Self::Cancel | Self::ClosePanel => "cancel",
            Self::Done => "done",
            Self::Pause => "pause",
            Self::Stop => "stop",
            Self::CopyText | Self::CopyTranslation => "copy",
            Self::Color | Self::Width => "",
        }
    }
    fn label(self, o: &Options) -> &str {
        if self == Self::Done && o.kind == Kind::Recording {
            return o.tr(
                "倒计时后开始录制",
                "Start after countdown",
                "Iniciar tras la cuenta atrás",
            );
        }
        let (z, e, s) = match self {
            Self::Full => ("全屏", "Full screen", "Pantalla completa"),
            Self::Last => ("上次选区", "Previous region", "Región anterior"),
            Self::Select => ("选区 / 调整 (V)", "Selection (V)", "Selección (V)"),
            Self::Pen => ("画笔 (P)", "Pen (P)", "Lápiz (P)"),
            Self::Arrow => ("箭头 (A)", "Arrow (A)", "Flecha (A)"),
            Self::Rectangle => ("矩形 (R)", "Rectangle (R)", "Rectángulo (R)"),
            Self::Ellipse => ("椭圆 (O)", "Ellipse (O)", "Elipse (O)"),
            Self::Text => (
                "文字 (T)，Ctrl+Enter 确认",
                "Text (T), Ctrl+Enter to commit",
                "Texto (T), Ctrl+Enter para confirmar",
            ),
            Self::Mosaic => ("马赛克 (M)", "Mosaic (M)", "Mosaico (M)"),
            Self::Step => ("序号 (N)", "Number (N)", "Número (N)"),
            Self::Color => ("标注颜色", "Color", "Color"),
            Self::Width => ("线条粗细", "Line width", "Grosor"),
            Self::Undo => ("撤销 Ctrl+Z", "Undo Ctrl+Z", "Deshacer Ctrl+Z"),
            Self::Redo => (
                "重做 Ctrl+Shift+Z",
                "Redo Ctrl+Shift+Z",
                "Rehacer Ctrl+Shift+Z",
            ),
            Self::Pin => ("固定到桌面", "Pin image", "Fijar imagen"),
            Self::Ocr => (
                "识别文字（本地）",
                "Recognize text locally",
                "Reconocer texto localmente",
            ),
            Self::Translate => (
                "翻译文字（AI）",
                "Translate text (AI)",
                "Traducir texto (IA)",
            ),
            Self::Save => (
                "另存 PNG · Ctrl+S",
                "Save PNG · Ctrl+S",
                "Guardar PNG · Ctrl+S",
            ),
            Self::Cancel => ("取消 Esc", "Cancel Esc", "Cancelar Esc"),
            Self::Done => (
                "复制并完成 Enter",
                "Copy and finish Enter",
                "Copiar y terminar Enter",
            ),
            Self::Pause => ("暂停 / 继续", "Pause / resume", "Pausar / continuar"),
            Self::Stop => (
                "结束录制并预览",
                "Stop and preview",
                "Detener y previsualizar",
            ),
            Self::CopyText => ("复制原文", "Copy original", "Copiar original"),
            Self::CopyTranslation => ("复制译文", "Copy translation", "Copiar traducción"),
            Self::ClosePanel => ("关闭结果", "Close results", "Cerrar resultados"),
        };
        o.tr(z, e, s)
    }
}
fn hit(r: D2D_RECT_F, p: (i32, i32)) -> bool {
    p.0 as f32 >= r.left && (p.0 as f32) < r.right && p.1 as f32 >= r.top && (p.1 as f32) < r.bottom
}
#[derive(Clone, Copy)]
enum DragKind {
    New,
    Move,
    Resize(u8),
}
struct Drag {
    start: (i32, i32),
    original: Option<Selection>,
    kind: DragKind,
}

struct Renderer {
    target: ID2D1HwndRenderTarget,
    bitmap: Option<ID2D1Bitmap>,
    ink: ID2D1SolidColorBrush,
    mask: ID2D1SolidColorBrush,
    paper: ID2D1SolidColorBrush,
    tint: ID2D1SolidColorBrush,
    accent: ID2D1SolidColorBrush,
    border: ID2D1SolidColorBrush,
    icons: super::native_icons::Icons,
    text: IDWriteTextFormat,
    body: IDWriteTextFormat,
    clock: IDWriteTextFormat,
    white: ID2D1SolidColorBrush,
}
impl Renderer {
    unsafe fn new(hwnd: HWND, frame: &DesktopFrame, scale: f32) -> Result<Self, String> {
        let factory: ID2D1Factory = D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, None)
            .map_err(|e| e.to_string())?;
        let target = factory
            .CreateHwndRenderTarget(
                &D2D1_RENDER_TARGET_PROPERTIES {
                    pixelFormat: D2D1_PIXEL_FORMAT {
                        format: DXGI_FORMAT_B8G8R8A8_UNORM,
                        alphaMode: D2D1_ALPHA_MODE_IGNORE,
                    },
                    dpiX: 96.0,
                    dpiY: 96.0,
                    ..Default::default()
                },
                &D2D1_HWND_RENDER_TARGET_PROPERTIES {
                    hwnd,
                    pixelSize: D2D_SIZE_U {
                        width: frame.width,
                        height: frame.height,
                    },
                    presentOptions: D2D1_PRESENT_OPTIONS_NONE,
                },
            )
            .map_err(|e| e.to_string())?;
        let bitmap = Some(editor::bitmap(&target, frame)?);
        let ink = editor::brush(&target, 0x71778a)?;
        let mask = target
            .CreateSolidColorBrush(
                &D2D1_COLOR_F {
                    r: 0.035,
                    g: 0.075,
                    b: 0.13,
                    a: 0.43,
                },
                None,
            )
            .map_err(|e| e.to_string())?;
        let paper = editor::brush(&target, 0xfbfaf8)?;
        let text = editor::text_format(13.0 * scale, true)?;
        let tint = editor::brush(&target, 0xece9fb)?;
        let accent = editor::brush(&target, 0x7164d7)?;
        let border = editor::brush(&target, 0xe0ddeb)?;
        let icons = super::native_icons::Icons::new(&factory)?;
        let body = editor::text_format(12.0 * scale, false)?;
        let clock = editor::text_format(18.0 * scale, false)?;
        let white = editor::brush(&target, 0xffffff)?;
        Ok(Self {
            target,
            bitmap,
            ink,
            mask,
            paper,
            text,
            tint,
            accent,
            border,
            icons,
            body,
            clock,
            white,
        })
    }
    unsafe fn label(&self, text: &str, rect: D2D_RECT_F) {
        self.target.DrawText(
            &text.encode_utf16().collect::<Vec<_>>(),
            &self.text,
            &rect,
            &self.ink,
            D2D1_DRAW_TEXT_OPTIONS_CLIP,
            DWRITE_MEASURING_MODE_NATURAL,
        );
    }
    unsafe fn caption(&self, text: &str, r: D2D_RECT_F, font: &IDWriteTextFormat, color: u32) {
        self.ink.SetColor(&editor::color(color));
        self.target.DrawText(
            &text.encode_utf16().collect::<Vec<_>>(),
            font,
            &r,
            &self.ink,
            D2D1_DRAW_TEXT_OPTIONS_CLIP,
            DWRITE_MEASURING_MODE_NATURAL,
        );
        self.ink.SetColor(&editor::color(0x71778a));
    }
    unsafe fn button(&self, s: &CaptureUi, a: Action, r: D2D_RECT_F) {
        let rounded = D2D1_ROUNDED_RECT {
            rect: r,
            radiusX: 9.0 * s.scale,
            radiusY: 9.0 * s.scale,
        };
        let selected = a.tool().is_some_and(|t| t == s.tool)
            || a == Action::Pause && s.recording.as_ref().is_some_and(|r| r.paused);
        let enabled = s.enabled(a);
        if a == Action::Done {
            self.accent.SetOpacity(if enabled { 1.0 } else { 0.35 });
            self.target.FillRoundedRectangle(&rounded, &self.accent);
            self.accent.SetOpacity(1.0);
        } else if a == Action::Stop {
            self.tint.SetColor(&editor::color(if s.hover == Some(a) {
                0xf9dde5
            } else {
                0xfcecef
            }));
            self.target.FillRoundedRectangle(&rounded, &self.tint);
        } else if selected || s.hover == Some(a) {
            self.tint
                .SetColor(&editor::color(if selected { 0xe4ddff } else { 0xece9fb }));
            self.target.FillRoundedRectangle(&rounded, &self.tint);
            if selected {
                self.border.SetColor(&editor::color(0xc8bbfa));
                self.target
                    .DrawRoundedRectangle(&rounded, &self.border, s.scale, None);
                self.border.SetColor(&editor::color(0xe0ddeb));
            }
        }
        self.ink.SetColor(&editor::color(if a == Action::Done {
            0xffffff
        } else if a == Action::Stop {
            0xc45d72
        } else if selected {
            0x5746c3
        } else if s.hover == Some(a) {
            0x6555c9
        } else {
            0x71778a
        }));
        self.ink.SetOpacity(if enabled { 1.0 } else { 0.35 });
        if a == Action::Color {
            self.accent.SetColor(&editor::color(s.color));
            self.target.FillEllipse(
                &D2D1_ELLIPSE {
                    point: point((r.left + r.right) / 2.0, (r.top + r.bottom) / 2.0),
                    radiusX: 7.0 * s.scale,
                    radiusY: 7.0 * s.scale,
                },
                &self.accent,
            );
            self.accent.SetColor(&editor::color(0x7164d7));
        } else if a == Action::Width {
            self.label(&format!("{}", s.width as u32), r);
        } else {
            let name = if a == Action::Done && s.options.kind == Kind::Recording
                || a == Action::Pause && s.recording.as_ref().is_some_and(|r| r.paused)
            {
                "play"
            } else {
                a.icon()
            };
            self.icons.draw(&self.target, &self.ink, name, r, s.scale);
            if a == Action::Translate {
                self.accent.SetColor(&editor::color(0x6555c9));
                self.target.FillRoundedRectangle(
                    &D2D1_ROUNDED_RECT {
                        rect: area(
                            r.right - 12.0 * s.scale,
                            r.bottom - 10.0 * s.scale,
                            12.0 * s.scale,
                            10.0 * s.scale,
                        ),
                        radiusX: 3.0 * s.scale,
                        radiusY: 3.0 * s.scale,
                    },
                    &self.accent,
                );
                self.accent.SetColor(&editor::color(0x7164d7));
                self.ink.SetColor(&editor::color(0xffffff));
                let small = editor::text_format(7.0 * s.scale, true);
                if let Ok(small) = small {
                    self.target.DrawText(
                        &"AI".encode_utf16().collect::<Vec<_>>(),
                        &small,
                        &area(
                            r.right - 12.0 * s.scale,
                            r.bottom - 10.0 * s.scale,
                            12.0 * s.scale,
                            10.0 * s.scale,
                        ),
                        &self.ink,
                        D2D1_DRAW_TEXT_OPTIONS_CLIP,
                        DWRITE_MEASURING_MODE_NATURAL,
                    );
                }
            }
        }
        self.ink.SetOpacity(1.0);
        self.ink.SetColor(&editor::color(0x71778a));
    }
    unsafe fn draw(&self, s: &CaptureUi) -> Result<(), String> {
        self.target.BeginDraw();
        if s.toolbar {
            self.target.Clear(Some(&editor::color(0xfbfaf8)));
            let width = self.target.GetPixelSize().width as f32;
            let h = self.target.GetPixelSize().height as f32;
            self.icons.draw(
                &self.target,
                &self.ink,
                "drag",
                area(0.0, 0.0, 28.0 * s.scale, h),
                s.scale,
            );
            let paused = s.recording.as_ref().is_some_and(|r| r.paused);
            let state = if s.stopping {
                s.options.tr("正在保存…", "Saving…", "Guardando…")
            } else if s.recording.is_none() {
                s.options.tr("准备录制…", "Preparing…", "Preparando…")
            } else if s.hover == Some(Action::Stop) {
                s.options
                    .tr("结束并预览", "Stop and preview", "Detener y ver")
            } else if s.hover == Some(Action::Pause) {
                if paused {
                    s.options.tr("继续录制", "Resume", "Continuar")
                } else {
                    s.options.tr("暂停录制", "Pause", "Pausar")
                }
            } else if paused {
                s.options.tr("已暂停", "Paused", "En pausa")
            } else {
                s.options.tr("正在录屏", "Recording", "Grabando")
            };
            self.accent
                .SetColor(&editor::color(if paused { 0x9e96bc } else { 0xd3556d }));
            self.target.FillEllipse(
                &D2D1_ELLIPSE {
                    point: point(39.0 * s.scale, 17.0 * s.scale),
                    radiusX: 3.0 * s.scale,
                    radiusY: 3.0 * s.scale,
                },
                &self.accent,
            );
            self.accent.SetColor(&editor::color(0x7164d7));
            self.caption(
                state,
                area(
                    49.0 * s.scale,
                    8.0 * s.scale,
                    127.0 * s.scale,
                    17.0 * s.scale,
                ),
                &self.body,
                0x71778a,
            );
            let seconds = s.elapsed();
            self.caption(
                &format!("{:02}:{:02}", seconds / 60, seconds % 60),
                area(
                    34.0 * s.scale,
                    26.0 * s.scale,
                    140.0 * s.scale,
                    25.0 * s.scale,
                ),
                &self.clock,
                0x343a4b,
            );
            self.target.DrawLine(
                point(182.0 * s.scale, 12.0 * s.scale),
                point(182.0 * s.scale, h - 12.0 * s.scale),
                &self.border,
                s.scale,
                None,
            );
            for (a, r) in s.toolbar_buttons() {
                self.button(s, a, r);
            }
            self.target.DrawRoundedRectangle(
                &D2D1_ROUNDED_RECT {
                    rect: area(1.0, 1.0, width - 2.0, h - 2.0),
                    radiusX: 12.0 * s.scale,
                    radiusY: 12.0 * s.scale,
                },
                &self.border,
                s.scale,
                None,
            );
        } else {
            if let Some(bitmap) = &self.bitmap {
                self.target.DrawBitmap(
                    bitmap,
                    None,
                    1.0,
                    D2D1_BITMAP_INTERPOLATION_MODE_NEAREST_NEIGHBOR,
                    None,
                );
            }
            let (w, h) = (s.frame.width as f32, s.frame.height as f32);
            if let Some(selection) = s.selection {
                self.target
                    .PushAxisAlignedClip(&selection.rect(), D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
                for mark in &s.history.marks {
                    editor::draw_mark(&self.target, &s.frame, mark, (0.0, 0.0))?;
                }
                if let Some(mark) = &s.draft {
                    editor::draw_mark(&self.target, &s.frame, mark, (0.0, 0.0))?;
                }
                self.target.PopAxisAlignedClip();
                let r = selection.rect();
                for a in [
                    area(0.0, 0.0, w, r.top),
                    area(0.0, r.bottom, w, h - r.bottom),
                    area(0.0, r.top, r.left, r.bottom - r.top),
                    area(r.right, r.top, w - r.right, r.bottom - r.top),
                ] {
                    self.target.FillRectangle(&a, &self.mask);
                }
                self.target
                    .DrawRectangle(&r, &self.ink, 2.0 * s.scale, None);
                if s.tool == Tool::Select {
                    for (x, y) in [
                        (r.left, r.top),
                        ((r.left + r.right) / 2.0, r.top),
                        (r.right, r.top),
                        (r.left, (r.top + r.bottom) / 2.0),
                        (r.right, (r.top + r.bottom) / 2.0),
                        (r.left, r.bottom),
                        ((r.left + r.right) / 2.0, r.bottom),
                        (r.right, r.bottom),
                    ] {
                        let a = area(
                            x - 3.0 * s.scale,
                            y - 3.0 * s.scale,
                            6.0 * s.scale,
                            6.0 * s.scale,
                        );
                        self.target.FillRectangle(&a, &self.paper);
                        self.target.DrawRectangle(&a, &self.ink, s.scale, None);
                    }
                }
                let size = area(
                    r.left,
                    (r.top - 26.0 * s.scale).max(0.0),
                    130.0 * s.scale,
                    24.0 * s.scale,
                );
                self.target.FillRectangle(&size, &self.paper);
                self.label(&format!("{} × {}", selection.width, selection.height), size);
            }
            if let Some(n) = s.counting {
                let (cx, cy) = s.selection.map_or((w / 2.0, h / 2.0), |r| {
                    ((r.x + r.width / 2) as f32, (r.y + r.height / 2) as f32)
                });
                let r = area(
                    (cx - 52.0 * s.scale).clamp(8.0, w - 104.0 * s.scale - 8.0),
                    (cy - 58.0 * s.scale).clamp(8.0, h - 116.0 * s.scale - 8.0),
                    104.0 * s.scale,
                    116.0 * s.scale,
                );
                let card = D2D1_ROUNDED_RECT {
                    rect: r,
                    radiusX: 16.0 * s.scale,
                    radiusY: 16.0 * s.scale,
                };
                self.target.FillRoundedRectangle(&card, &self.paper);
                self.target
                    .DrawRoundedRectangle(&card, &self.border, s.scale, None);
                self.caption(
                    s.options.tr("准备录制", "Get ready", "Preparando"),
                    area(
                        r.left + 12.0 * s.scale,
                        r.top + 12.0 * s.scale,
                        r.right - r.left - 24.0 * s.scale,
                        20.0 * s.scale,
                    ),
                    &self.body,
                    0x71778a,
                );
                let large = editor::text_format(48.0 * s.scale, true)?;
                self.target.DrawText(
                    &n.to_string().encode_utf16().collect::<Vec<_>>(),
                    &large,
                    &area(
                        r.left,
                        r.top + 24.0 * s.scale,
                        r.right - r.left,
                        r.bottom - r.top - 24.0 * s.scale,
                    ),
                    &self.accent,
                    D2D1_DRAW_TEXT_OPTIONS_NONE,
                    DWRITE_MEASURING_MODE_NATURAL,
                );
            } else if s.drag.is_none() && s.text_edit.is_none() {
                let r = s.toolbar_rect();
                let rect = area(
                    r.left - 4.0 * s.scale,
                    r.top - 4.0 * s.scale,
                    r.right - r.left + 8.0 * s.scale,
                    r.bottom - r.top + 4.0 * s.scale,
                );
                let rounded = D2D1_ROUNDED_RECT {
                    rect,
                    radiusX: 12.0 * s.scale,
                    radiusY: 12.0 * s.scale,
                };
                self.target.FillRoundedRectangle(&rounded, &self.paper);
                self.target
                    .DrawRoundedRectangle(&rounded, &self.border, s.scale, None);
                for (a, r) in s.buttons() {
                    self.button(s, a, r);
                }
            }
            let hint_w = (900.0 * s.scale).min(w - 16.0);
            let hint = area((w - hint_w) / 2.0, 14.0 * s.scale, hint_w, 34.0 * s.scale);
            let hint_card = D2D1_ROUNDED_RECT {
                rect: hint,
                radiusX: 10.0 * s.scale,
                radiusY: 10.0 * s.scale,
            };
            self.target.FillRoundedRectangle(&hint_card, &self.paper);
            self.target
                .DrawRoundedRectangle(&hint_card, &self.border, s.scale, None);
            self.label(&s.hint(), hint);
            if s.panel_open {
                let r = s.panel_rect();
                let rounded = D2D1_ROUNDED_RECT {
                    rect: r,
                    radiusX: 12.0 * s.scale,
                    radiusY: 12.0 * s.scale,
                };
                self.target.FillRoundedRectangle(&rounded, &self.paper);
                self.target
                    .DrawRoundedRectangle(&rounded, &self.border, s.scale, None);
                self.icons.draw(
                    &self.target,
                    &self.ink,
                    if s.translate { "translate" } else { "ocr" },
                    area(
                        r.left + 10.0 * s.scale,
                        r.top + 8.0 * s.scale,
                        26.0 * s.scale,
                        26.0 * s.scale,
                    ),
                    s.scale,
                );
                self.caption(
                    s.options
                        .tr("文字结果", "Text results", "Resultados de texto"),
                    area(
                        r.left + 42.0 * s.scale,
                        r.top + 12.0 * s.scale,
                        r.right - r.left - 140.0 * s.scale,
                        22.0 * s.scale,
                    ),
                    &self.body,
                    0x343a4b,
                );
                for (translated, body) in s.result_panes() {
                    let title = if translated {
                        s.options
                            .tr("译文 · AI", "Translation · AI", "Traducción · IA")
                    } else {
                        s.options.tr(
                            "原文 · 本地识别",
                            "Original · Local OCR",
                            "Original · OCR local",
                        )
                    };
                    self.caption(
                        title,
                        area(
                            body.left,
                            body.top - 24.0 * s.scale,
                            body.right - body.left - 34.0 * s.scale,
                            22.0 * s.scale,
                        ),
                        &self.body,
                        0x71778a,
                    );
                    let card = D2D1_ROUNDED_RECT {
                        rect: body,
                        radiusX: 8.0 * s.scale,
                        radiusY: 8.0 * s.scale,
                    };
                    self.target.FillRoundedRectangle(&card, &self.white);
                    self.target
                        .DrawRoundedRectangle(&card, &self.border, s.scale, None);
                }
                for (a, b) in s.panel_buttons() {
                    self.button(s, a, b);
                }
            }
        }
        self.target.EndDraw(None, None).map_err(|e| e.to_string())
    }
}

struct CaptureUi {
    app: AppHandle,
    options: Options,
    frame: DesktopFrame,
    renderer: Option<Renderer>,
    scale: f32,
    selection: Option<Selection>,
    drag: Option<Drag>,
    tool: Tool,
    history: History,
    draft: Option<Mark>,
    color: u32,
    width: f32,
    custom_colors: [u32; 16],
    text_edit: Option<HWND>,
    text_origin: Option<(f32, f32)>,
    text_font: Option<HFONT>,
    panel_edit: Option<HWND>,
    panel_edit2: Option<HWND>,
    panel_font: Option<HFONT>,
    revision: u64,
    panel_open: bool,
    panel_dismissed: bool,
    translate: bool,
    loading: bool,
    recognized: String,
    translated: String,
    ocr_error: String,
    notice: Option<String>,
    hover: Option<Action>,
    counting: Option<u32>,
    toolbar: bool,
    recording: Option<RecordingStatus>,
    stopping: bool,
    record_pending: bool,
    frozen_seconds: u64,
    border: Option<Window>,
    started: Instant,
    capture_ms: u64,
    prepare_ms: u64,
    ready_ms: Option<u64>,
    action: String,
    path: Option<String>,
    closing: bool,
    fatal: Option<String>,
}
impl CaptureUi {
    fn enabled(&self, a: Action) -> bool {
        if self.stopping {
            return false;
        }
        if self.toolbar {
            return match a {
                Action::Pause => {
                    self.recording.as_ref().is_some_and(|r| r.active) && !self.record_pending
                }
                Action::Stop => true,
                _ => false,
            };
        }
        match a {
            Action::Undo => !self.history.marks.is_empty(),
            Action::Redo => !self.history.redo.is_empty(),
            Action::Pin | Action::Ocr | Action::Save | Action::Done => self.selection.is_some(),
            Action::Translate => self.selection.is_some() && self.options.ai_enabled,
            Action::CopyText => !self.recognized.is_empty(),
            Action::CopyTranslation => !self.translated.is_empty(),
            _ => true,
        }
    }
    fn actions(&self) -> Vec<Action> {
        if self.options.kind == Kind::Recording {
            return vec![Action::Full, Action::Last, Action::Cancel, Action::Done];
        }
        let mut v = vec![
            Action::Full,
            Action::Last,
            Action::Select,
            Action::Pen,
            Action::Arrow,
            Action::Rectangle,
            Action::Ellipse,
            Action::Text,
            Action::Mosaic,
            Action::Step,
            Action::Color,
            Action::Width,
            Action::Undo,
            Action::Redo,
            Action::Pin,
            Action::Ocr,
        ];
        if self.options.ai_enabled {
            v.push(Action::Translate);
        }
        v.extend([Action::Save, Action::Cancel, Action::Done]);
        v
    }
    fn toolbar_rect(&self) -> D2D_RECT_F {
        let count = self.actions().len();
        let step = 38.0 * self.scale;
        let cols = ((self.frame.width as f32 - 24.0) / step).floor().max(4.0) as usize;
        let cols = cols.min(count);
        let rows = count.div_ceil(cols);
        let width = cols as f32 * step;
        let height = rows as f32 * step;
        let left = self
            .selection
            .map_or((self.frame.width as f32 - width) / 2.0, |r| r.x as f32)
            .clamp(8.0, (self.frame.width as f32 - width - 8.0).max(8.0));
        let below = self.selection.map_or(70.0 * self.scale, |r| {
            (r.y + r.height) as f32 + 8.0 * self.scale
        });
        let y = if below + height < self.frame.height as f32 - 8.0 {
            below
        } else {
            self.selection
                .map_or(8.0, |r| (r.y as f32 - height - 8.0 * self.scale).max(8.0))
        };
        area(left, y, width, height)
    }
    fn buttons(&self) -> Vec<(Action, D2D_RECT_F)> {
        let r = self.toolbar_rect();
        let step = 38.0 * self.scale;
        let cols = ((r.right - r.left) / step).round() as usize;
        self.actions()
            .into_iter()
            .enumerate()
            .map(|(i, a)| {
                (
                    a,
                    area(
                        r.left + (i % cols) as f32 * step,
                        r.top + (i / cols) as f32 * step,
                        34.0 * self.scale,
                        34.0 * self.scale,
                    ),
                )
            })
            .collect()
    }
    fn toolbar_buttons(&self) -> Vec<(Action, D2D_RECT_F)> {
        vec![
            (
                Action::Pause,
                area(
                    198.0 * self.scale,
                    10.0 * self.scale,
                    36.0 * self.scale,
                    36.0 * self.scale,
                ),
            ),
            (
                Action::Stop,
                area(
                    242.0 * self.scale,
                    10.0 * self.scale,
                    36.0 * self.scale,
                    36.0 * self.scale,
                ),
            ),
        ]
    }
    fn dual_result(&self) -> bool {
        self.translate && self.options.auto_ocr && self.options.auto_translate
    }
    fn result_panes(&self) -> Vec<(bool, D2D_RECT_F)> {
        let p = self.panel_rect();
        let kinds = if self.dual_result() {
            vec![false, true]
        } else {
            vec![self.translate]
        };
        kinds
            .into_iter()
            .enumerate()
            .map(|(i, tr)| {
                (
                    tr,
                    area(
                        p.left + 12.0 * self.scale,
                        p.top + (68.0 + i as f32 * 140.0) * self.scale,
                        p.right - p.left - 24.0 * self.scale,
                        104.0 * self.scale,
                    ),
                )
            })
            .collect()
    }
    fn panel_rect(&self) -> D2D_RECT_F {
        let bar = self.toolbar_rect();
        let w = (500.0 * self.scale).min(self.frame.width as f32 - 24.0);
        let h = ((if self.dual_result() { 324.0 } else { 184.0 }) * self.scale)
            .min(self.frame.height as f32 - 100.0 * self.scale);
        let x = bar.left.min(self.frame.width as f32 - w - 8.0).max(8.0);
        let below = bar.bottom + 8.0 * self.scale;
        let y = if below + h < self.frame.height as f32 {
            below
        } else {
            (bar.top - h - 8.0 * self.scale).max(60.0 * self.scale)
        };
        area(x, y, w, h)
    }
    fn panel_buttons(&self) -> Vec<(Action, D2D_RECT_F)> {
        let p = self.panel_rect();
        let mut buttons = vec![(
            Action::ClosePanel,
            area(
                p.right - 36.0 * self.scale,
                p.top + 8.0 * self.scale,
                26.0 * self.scale,
                26.0 * self.scale,
            ),
        )];
        if !self.translate && self.options.ai_enabled {
            buttons.push((
                Action::Translate,
                area(
                    p.right - 70.0 * self.scale,
                    p.top + 8.0 * self.scale,
                    26.0 * self.scale,
                    26.0 * self.scale,
                ),
            ));
        }
        for (tr, r) in self.result_panes() {
            buttons.push((
                if tr {
                    Action::CopyTranslation
                } else {
                    Action::CopyText
                },
                area(
                    r.right - 26.0 * self.scale,
                    r.top - 27.0 * self.scale,
                    26.0 * self.scale,
                    26.0 * self.scale,
                ),
            ));
        }
        buttons
    }
    fn action_at(&self, p: (i32, i32)) -> Option<Action> {
        let buttons = if self.toolbar {
            self.toolbar_buttons()
        } else if self.panel_open && hit(self.panel_rect(), p) {
            self.panel_buttons()
        } else {
            self.buttons()
        };
        buttons
            .into_iter()
            .find(|(_, r)| hit(*r, p))
            .map(|(a, _)| a)
    }
    fn cursor_at(&self, p: (i32, i32)) -> PCWSTR {
        // Keep the drawing cursor while captured, even when a drag crosses the toolbar.
        if self.drag.is_some() || self.draft.is_some() {
            return IDC_CROSS;
        }
        if self.counting.is_some() {
            return IDC_ARROW;
        }
        if let Some(action) = self.action_at(p) {
            return if self.enabled(action) {
                IDC_HAND
            } else {
                IDC_ARROW
            };
        }
        if self.toolbar {
            return if p.0 < (182.0 * self.scale) as i32 {
                IDC_SIZEALL
            } else {
                IDC_ARROW
            };
        }
        if hit(self.toolbar_rect(), p) || (self.panel_open && hit(self.panel_rect(), p)) {
            return IDC_ARROW;
        }
        IDC_CROSS
    }
    unsafe fn update_cursor(&self, p: (i32, i32)) {
        if let Ok(cursor) = LoadCursorW(None, self.cursor_at(p)) {
            SetCursor(Some(cursor));
        }
    }
    fn hint(&self) -> String {
        if let Some(s) = &self.notice {
            return s.clone();
        }
        if let Some(a) = self.hover {
            return a.label(&self.options).into();
        }
        if self.options.kind == Kind::Recording {
            return self
                .options
                .tr(
                    "拖动框选 · Enter 开始倒计时 · Esc 取消",
                    "Drag to select · Enter countdown · Esc cancel",
                    "Arrastra para seleccionar · Enter cuenta atrás · Esc cancelar",
                )
                .into();
        }
        self.options.tr("拖动框选 · V 调整 · Ctrl+Z 撤销 · Enter 完成 · Esc 取消","Drag to select · V adjust · Ctrl+Z undo · Enter finish · Esc cancel","Arrastra para seleccionar · V ajustar · Ctrl+Z deshacer · Enter finalizar · Esc cancelar").into()
    }
    unsafe fn repaint(&self, hwnd: HWND) {
        let _ = InvalidateRect(Some(hwnd), None, false);
    }
    fn elapsed(&self) -> u64 {
        self.recording.as_ref().map_or(0, |r| {
            if r.paused {
                self.frozen_seconds
            } else {
                now_ms().saturating_sub(r.started_at) / 1000
            }
        })
    }
    fn image(&self) -> Result<Image, String> {
        unsafe {
            editor::render(
                &self.frame,
                self.selection.ok_or("请先框选区域")?,
                &self.history.marks,
            )
        }
    }
    unsafe fn edit_changed(&mut self, hwnd: HWND) {
        self.revision += 1;
        self.recognized.clear();
        self.translated.clear();
        self.ocr_error.clear();
        self.loading = false;
        self.panel_open = false;
        for edit in [self.panel_edit, self.panel_edit2].into_iter().flatten() {
            let _ = ShowWindow(edit, SW_HIDE);
        }
        let _ = KillTimer(Some(hwnd), OCR_TIMER);
    }
    unsafe fn schedule_ocr(&self, hwnd: HWND) {
        if self.options.kind == Kind::Screenshot
            && !self.panel_dismissed
            && self.selection.is_some()
            && (self.options.auto_ocr || (self.options.auto_translate && self.options.ai_enabled))
        {
            SetTimer(Some(hwnd), OCR_TIMER, 450, None);
        }
    }
    unsafe fn commit_text(&mut self, hwnd: HWND) {
        if let Some(edit) = self.text_edit.take() {
            let length = GetWindowTextLengthW(edit).clamp(0, 20_000) as usize;
            let mut text = vec![0u16; length + 1];
            let n = GetWindowTextW(edit, &mut text);
            let text = String::from_utf16_lossy(&text[..n.max(0) as usize]);
            let _ = DestroyWindow(edit);
            if let Some(font) = self.text_font.take() {
                let _ = DeleteObject(HGDIOBJ(font.0));
            }
            if !text.trim().is_empty() {
                self.history.push(Mark {
                    tool: Tool::Text,
                    points: vec![self.text_origin.take().unwrap_or((0.0, 0.0))],
                    color: self.color,
                    width: self.width,
                    text,
                });
                self.edit_changed(hwnd);
                self.schedule_ocr(hwnd);
            }
            let _ = SetFocus(Some(hwnd));
        }
    }
    unsafe fn begin_text(&mut self, hwnd: HWND, p: (i32, i32)) -> Result<(), String> {
        let w = (400.0 * self.scale).min(self.frame.width as f32 - 16.0) as i32;
        let h = (140.0 * self.scale).min(self.frame.height as f32 - 16.0) as i32;
        let x = p.0.min(self.frame.width as i32 - w - 8).max(8);
        let y = p.1.min(self.frame.height as i32 - h - 8).max(8);
        let edit = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            w!("EDIT"),
            w!(""),
            WS_CHILD
                | WS_VISIBLE
                | WS_BORDER
                | WS_VSCROLL
                | WINDOW_STYLE((ES_MULTILINE | ES_AUTOVSCROLL | ES_WANTRETURN) as u32),
            x,
            y,
            w,
            h,
            Some(hwnd),
            None,
            None,
            None,
        )
        .map_err(|e| e.to_string())?;
        let font = font((self.width * 5.0 + 16.0) as i32);
        SendMessageW(
            edit,
            WM_SETFONT,
            Some(WPARAM(font.0 as usize)),
            Some(LPARAM(1)),
        );
        SendMessageW(edit, EM_SETLIMITTEXT, Some(WPARAM(20_000)), Some(LPARAM(0)));
        self.text_edit = Some(edit);
        self.text_font = Some(font);
        self.text_origin = Some((p.0 as f32, p.1 as f32));
        let _ = SetFocus(Some(edit));
        Ok(())
    }
    unsafe fn create_result_edit(&mut self, hwnd: HWND) -> Result<HWND, String> {
        let edit = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            w!("EDIT"),
            w!(""),
            WS_CHILD
                | WS_VSCROLL
                | WINDOW_STYLE((ES_MULTILINE | ES_AUTOVSCROLL | ES_READONLY) as u32),
            0,
            0,
            100,
            100,
            Some(hwnd),
            None,
            None,
            None,
        )
        .map_err(|e| e.to_string())?;
        let font = *self
            .panel_font
            .get_or_insert_with(|| font((13.0 * self.scale) as i32));
        SendMessageW(
            edit,
            WM_SETFONT,
            Some(WPARAM(font.0 as usize)),
            Some(LPARAM(1)),
        );
        SendMessageW(
            edit,
            EM_SETLIMITTEXT,
            Some(WPARAM(100_000)),
            Some(LPARAM(0)),
        );
        Ok(edit)
    }
    unsafe fn update_panel(&mut self, hwnd: HWND) -> Result<(), String> {
        for edit in [self.panel_edit, self.panel_edit2].into_iter().flatten() {
            let _ = ShowWindow(edit, SW_HIDE);
        }
        if !self.panel_open {
            return Ok(());
        }
        if self.panel_edit.is_none() {
            self.panel_edit = Some(self.create_result_edit(hwnd)?);
        }
        if self.dual_result() && self.panel_edit2.is_none() {
            self.panel_edit2 = Some(self.create_result_edit(hwnd)?);
        }
        for (i, (translated, r)) in self.result_panes().into_iter().enumerate() {
            let value = if self.loading {
                self.options
                    .tr(
                        "正在识别 / 翻译…",
                        "Recognizing / translating…",
                        "Reconociendo / traduciendo…",
                    )
                    .to_string()
            } else if !self.ocr_error.is_empty() && (translated || self.recognized.is_empty()) {
                self.ocr_error.clone()
            } else if self.recognized.is_empty() {
                self.options
                    .tr(
                        "未识别到文字，可调整选区后重新识别",
                        "No text found. Adjust the selection and retry.",
                        "No se encontró texto. Ajusta la selección e inténtalo de nuevo.",
                    )
                    .into()
            } else if translated {
                self.translated.clone()
            } else {
                self.recognized.clone()
            };
            let edit = if i == 0 {
                self.panel_edit.unwrap()
            } else {
                self.panel_edit2.unwrap()
            };
            SetWindowTextW(edit, &HSTRING::from(value)).map_err(|e| e.to_string())?;
            SetWindowPos(
                edit,
                None,
                (r.left + 8.0 * self.scale) as i32,
                (r.top + 8.0 * self.scale) as i32,
                (r.right - r.left - 16.0 * self.scale) as i32,
                (r.bottom - r.top - 16.0 * self.scale) as i32,
                SWP_NOACTIVATE | SWP_NOZORDER,
            )
            .map_err(|e| e.to_string())?;
            let _ = ShowWindow(edit, SW_SHOWNOACTIVATE);
        }
        Ok(())
    }
    unsafe fn ocr(&mut self, hwnd: HWND, translate: bool) -> Result<(), String> {
        if self.selection.is_none() {
            return Ok(());
        }
        self.revision += 1;
        self.panel_open = true;
        self.panel_dismissed = false;
        self.translate = translate;
        self.loading = true;
        self.ocr_error.clear();
        self.update_panel(hwnd)?;
        let text = self.recognized.clone();
        let path = if text.is_empty() {
            let image = self.image()?;
            let path = super::capture_workspace::new_capture_draft(self.app.clone(), "png".into())?;
            std::fs::write(&path, image.png()?).map_err(|e| e.to_string())?;
            path
        } else {
            String::new()
        };
        service::request_ocr(
            &self.app,
            &self.options,
            self.revision,
            path,
            translate,
            text,
        )?;
        self.repaint(hwnd);
        Ok(())
    }
    unsafe fn record_begin(&mut self, hwnd: HWND) -> Result<(), String> {
        let s = self.selection.ok_or("请先框选区域")?;
        self.counting = None;
        let _ = KillTimer(Some(hwnd), COUNTDOWN);
        self.toolbar = true;
        self.panel_open = false;
        self.commit_text(hwnd);
        for edit in [self.panel_edit.take(), self.panel_edit2.take()]
            .into_iter()
            .flatten()
        {
            let _ = DestroyWindow(edit);
        }
        self.border = Some(recording_border(&self.frame, s, self.scale)?);
        SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            self.frame.x + 20,
            self.frame.y + 20,
            (292.0 * self.scale) as i32,
            (56.0 * self.scale) as i32,
            SWP_NOACTIVATE,
        )
        .map_err(|e| e.to_string())?;
        if let Some(r) = self.renderer.as_mut() {
            r.bitmap = None;
            r.target
                .Resize(&D2D_SIZE_U {
                    width: (292.0 * self.scale) as u32,
                    height: (56.0 * self.scale) as u32,
                })
                .map_err(|e| e.to_string())?;
        }
        let rounded = CreateRoundRectRgn(
            0,
            0,
            (292.0 * self.scale).ceil() as i32 + 1,
            (56.0 * self.scale).ceil() as i32 + 1,
            (24.0 * self.scale) as i32,
            (24.0 * self.scale) as i32,
        );
        if !rounded.is_invalid() && SetWindowRgn(hwnd, Some(rounded), true) == 0 {
            let _ = DeleteObject(HGDIOBJ(rounded.0));
        }
        self.frame.bgra = Vec::new();
        if let Some(r) = &self.renderer {
            r.draw(self)?;
        }
        let _ = DwmFlush();
        SetTimer(Some(hwnd), CLOCK, 500, None);
        let app = self.app.clone();
        let options = self.options.clone();
        let path = super::capture_workspace::new_capture_draft(app.clone(), "mp4".into())?;
        self.path = Some(path.clone());
        tauri::async_runtime::spawn(async move {
            match super::tools::start_screen_recording(
                app.clone(),
                options.display_id,
                path,
                Some(super::tools::CaptureRegion {
                    x: s.x,
                    y: s.y,
                    width: s.width,
                    height: s.height,
                }),
                Some(options.fps),
                Some(options.cursor),
            )
            .await
            {
                Ok(status) => service::post_for(&app, &options.id, Message::Recording(status)),
                Err(error) => service::post_for(&app, &options.id, Message::Failure(error)),
            }
        });
        Ok(())
    }
    unsafe fn stop(&mut self, hwnd: HWND) {
        if self.stopping {
            return;
        }
        self.stopping = true;
        self.repaint(hwnd);
        // If start is still pending, its tagged result will perform the stop.
        if self.recording.is_none() {
            return;
        }
        let app = self.app.clone();
        let id = self.options.id.clone();
        tauri::async_runtime::spawn_blocking(move || match super::tools::stop_recording(&app) {
            Ok(status) => service::post_for(&app, &id, Message::Recording(status)),
            Err(e) => service::post_for(&app, &id, Message::Failure(e)),
        });
    }
    unsafe fn close(&mut self, hwnd: HWND) {
        if self.closing {
            return;
        }
        if self.toolbar
            && (self.recording.as_ref().is_none_or(|r| r.active)
                || super::tools::recording_active(&self.app))
        {
            self.stop(hwnd);
            return;
        }
        self.closing = true;
        let _ = ReleaseCapture();
        let _ = KillTimer(Some(hwnd), COUNTDOWN);
        let _ = KillTimer(Some(hwnd), OCR_TIMER);
        let _ = KillTimer(Some(hwnd), CLOCK);
        self.border = None;
        let _ = DestroyWindow(hwnd);
    }
    unsafe fn act(&mut self, hwnd: HWND, action: Action) -> Result<(), String> {
        if !self.enabled(action) {
            return Ok(());
        }
        self.commit_text(hwnd);
        self.notice = None;
        if let Some(tool) = action.tool() {
            self.tool = tool;
            self.repaint(hwnd);
            return Ok(());
        }
        match action {
            Action::Full => {
                self.selection = Some(Selection {
                    x: 0,
                    y: 0,
                    width: self.frame.width,
                    height: self.frame.height,
                });
                self.edit_changed(hwnd);
                self.schedule_ocr(hwnd);
            }
            Action::Last => {
                if let Some(s) = last_region(&self.app, &self.frame) {
                    self.selection = Some(s);
                    self.edit_changed(hwnd);
                    self.schedule_ocr(hwnd);
                }
            }
            Action::Color => {
                let mut c = CHOOSECOLORW {
                    lStructSize: std::mem::size_of::<CHOOSECOLORW>() as u32,
                    hwndOwner: hwnd,
                    rgbResult: COLORREF(
                        ((self.color >> 16) & 255)
                            | (self.color & 0xff00)
                            | ((self.color & 255) << 16),
                    ),
                    lpCustColors: self.custom_colors.as_mut_ptr().cast(),
                    Flags: CC_FULLOPEN | CC_RGBINIT,
                    ..Default::default()
                };
                if ChooseColorW(&mut c).as_bool() {
                    let n = c.rgbResult.0;
                    self.color = ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255);
                }
            }
            Action::Width => {
                self.width = if self.width == 2.0 {
                    4.0
                } else if self.width == 4.0 {
                    8.0
                } else {
                    2.0
                }
            }
            Action::Undo => {
                self.history.undo();
                self.edit_changed(hwnd);
                self.schedule_ocr(hwnd);
            }
            Action::Redo => {
                self.history.redo();
                self.edit_changed(hwnd);
                self.schedule_ocr(hwnd);
            }
            Action::Cancel => self.close(hwnd),
            Action::Done => {
                remember_region(&self.app, &self.frame, self.selection.unwrap());
                if self.options.kind == Kind::Recording {
                    if self.options.countdown == 0 {
                        self.record_begin(hwnd)?;
                    } else {
                        self.counting = Some(self.options.countdown);
                        SetTimer(Some(hwnd), COUNTDOWN, 1000, None);
                    }
                } else {
                    copy_image(hwnd, &self.image()?)?;
                    self.action = "copied".into();
                    self.path = None;
                    self.close(hwnd);
                }
            }
            Action::Save => {
                if let Some(path) = save_dialog(hwnd, &self.options)? {
                    let bytes = self.image()?.png()?;
                    atomic_write(&path, &bytes)?;
                    self.path = Some(path.clone());
                    self.action = "saved".into();
                    self.notice = Some(format!(
                        "{} {path}",
                        self.options.tr("已保存：", "Saved:", "Guardado:")
                    ));
                }
            }
            Action::Pin => {
                let s = self.selection.unwrap();
                let path =
                    super::capture_workspace::new_capture_draft(self.app.clone(), "png".into())?;
                std::fs::write(&path, self.image()?.png()?).map_err(|e| e.to_string())?;
                super::capture_workspace::pin_native_image(
                    &self.app,
                    &path,
                    self.frame.x + s.x as i32,
                    self.frame.y + s.y as i32,
                    s.width,
                    s.height,
                    self.frame.x,
                    self.frame.y,
                    self.frame.width,
                    self.frame.height,
                    self.scale as f64,
                )?;
                self.path = Some(path);
                self.action = "pinned".into();
                self.close(hwnd);
            }
            Action::Ocr => self.ocr(hwnd, false)?,
            Action::Translate => self.ocr(hwnd, true)?,
            Action::CopyText => copy_text(hwnd, &self.recognized)?,
            Action::CopyTranslation => copy_text(hwnd, &self.translated)?,
            Action::ClosePanel => {
                self.panel_open = false;
                self.panel_dismissed = true;
                self.update_panel(hwnd)?;
            }
            Action::Stop => self.stop(hwnd),
            Action::Pause => {
                if let Some(r) = &self.recording {
                    self.frozen_seconds = self.elapsed();
                    self.record_pending = true;
                    let (app, paused) = (self.app.clone(), !r.paused);
                    let id = self.options.id.clone();
                    tauri::async_runtime::spawn_blocking(move || {
                        match super::tools::pause_screen_recording(app.clone(), paused) {
                            Ok(s) => service::post_for(&app, &id, Message::Recording(s)),
                            Err(e) => service::post_for(&app, &id, Message::Failure(e)),
                        }
                    });
                }
            }
            _ => {}
        }
        self.repaint(hwnd);
        Ok(())
    }
    unsafe fn notify(&mut self, hwnd: HWND) {
        for message in service::messages(&self.app, &self.options.id) {
            match message {
                Message::Cancel => self.close(hwnd),
                Message::Stop => {
                    if self.toolbar {
                        self.stop(hwnd);
                    }
                }
                Message::Pause => {
                    let _ = self.act(hwnd, Action::Pause);
                }
                Message::Ocr(r) => {
                    if r.revision == self.revision {
                        self.loading = false;
                        self.recognized = r.text;
                        self.translated = r.translated;
                        self.ocr_error = r.error;
                        let _ = self.update_panel(hwnd);
                        self.repaint(hwnd);
                    }
                }
                Message::Recording(status) => {
                    self.record_pending = false;
                    if status.active {
                        if status.paused && self.recording.as_ref().is_some_and(|r| !r.paused) {
                            self.frozen_seconds = self.elapsed();
                        }
                        self.recording = Some(status);
                        if self.stopping {
                            self.stopping = false;
                            self.stop(hwnd);
                        }
                    } else {
                        self.recording = Some(status.clone());
                        if let Some(e) = status.error {
                            self.fatal = Some(e);
                        }
                        self.stopping = false;
                        self.action = "recorded".into();
                        self.close(hwnd);
                    }
                    self.repaint(hwnd);
                }
                Message::Failure(e) => {
                    self.record_pending = false;
                    if self.toolbar && !super::tools::recording_active(&self.app) {
                        self.fatal = Some(e);
                        self.recording = Some(RecordingStatus::default());
                        self.stopping = false;
                        self.close(hwnd);
                    } else {
                        self.notice = Some(e);
                        self.stopping = false;
                        self.repaint(hwnd);
                    }
                }
            }
        }
    }
    unsafe fn pointer_down(&mut self, hwnd: HWND, p: (i32, i32)) -> Result<(), String> {
        let _ = SetFocus(Some(hwnd));
        if self.toolbar {
            for (a, r) in self.toolbar_buttons() {
                if hit(r, p) {
                    return self.act(hwnd, a);
                }
            }
            if p.0 < (182.0 * self.scale) as i32 {
                let _ = ReleaseCapture();
                SendMessageW(
                    hwnd,
                    WM_NCLBUTTONDOWN,
                    Some(WPARAM(HTCAPTION as usize)),
                    Some(LPARAM(0)),
                );
            }
            return Ok(());
        }
        if self.counting.is_some() {
            return Ok(());
        }
        self.commit_text(hwnd);
        if self.panel_open {
            for (a, r) in self.panel_buttons() {
                if hit(r, p) {
                    return self.act(hwnd, a);
                }
            }
            if hit(self.panel_rect(), p) {
                return Ok(());
            }
        }
        for (a, r) in self.buttons() {
            if hit(r, p) {
                return self.act(hwnd, a);
            }
        }
        self.edit_changed(hwnd);
        self.notice = None;
        if self.tool == Tool::Select || self.selection.is_none() {
            let original = self.selection;
            let kind = original.map_or(DragKind::New, |r| {
                let d = (6.0 * self.scale) as i32;
                let mut bits = 0;
                if (p.0 - r.x as i32).abs() < d {
                    bits |= 1;
                }
                if (p.0 - (r.x + r.width) as i32).abs() < d {
                    bits |= 2;
                }
                if (p.1 - r.y as i32).abs() < d {
                    bits |= 4;
                }
                if (p.1 - (r.y + r.height) as i32).abs() < d {
                    bits |= 8;
                }
                if bits != 0 {
                    DragKind::Resize(bits)
                } else if r.contains(p) {
                    DragKind::Move
                } else {
                    DragKind::New
                }
            });
            if matches!(kind, DragKind::New) {
                self.selection = None;
            }
            self.drag = Some(Drag {
                start: p,
                original,
                kind,
            });
        } else if self.selection.is_some_and(|r| r.contains(p)) {
            if self.tool == Tool::Text {
                return self.begin_text(hwnd, p);
            }
            let mark = Mark {
                tool: self.tool,
                points: vec![(p.0 as f32, p.1 as f32)],
                color: self.color,
                width: self.width,
                text: if self.tool == Tool::Step {
                    (self
                        .history
                        .marks
                        .iter()
                        .filter(|m| m.tool == Tool::Step)
                        .count()
                        + 1)
                    .to_string()
                } else {
                    String::new()
                },
            };
            if self.tool == Tool::Step {
                self.history.push(mark);
                self.schedule_ocr(hwnd);
            } else {
                self.draft = Some(mark);
            }
        }
        SetCapture(hwnd);
        self.repaint(hwnd);
        Ok(())
    }
    unsafe fn pointer_move(&mut self, hwnd: HWND, p: (i32, i32)) {
        if let Some(d) = &self.drag {
            self.selection = match (d.kind, d.original) {
                (DragKind::New, _) | (_, None) => {
                    Selection::between(d.start, p, self.frame.width, self.frame.height)
                }
                (DragKind::Move, Some(r)) => Some(Selection {
                    x: (r.x as i32 + p.0 - d.start.0).clamp(0, (self.frame.width - r.width) as i32)
                        as u32,
                    y: (r.y as i32 + p.1 - d.start.1)
                        .clamp(0, (self.frame.height - r.height) as i32)
                        as u32,
                    ..r
                }),
                (DragKind::Resize(bits), Some(r)) => Selection::between(
                    (
                        if bits & 1 != 0 { p.0 } else { r.x as i32 },
                        if bits & 4 != 0 { p.1 } else { r.y as i32 },
                    ),
                    (
                        if bits & 2 != 0 {
                            p.0
                        } else {
                            (r.x + r.width) as i32
                        },
                        if bits & 8 != 0 {
                            p.1
                        } else {
                            (r.y + r.height) as i32
                        },
                    ),
                    self.frame.width,
                    self.frame.height,
                ),
            };
            self.repaint(hwnd);
        } else if let Some(m) = self.draft.as_mut() {
            let p = (
                p.0.clamp(0, self.frame.width as i32) as f32,
                p.1.clamp(0, self.frame.height as i32) as f32,
            );
            if m.tool == Tool::Pen {
                if m.points.len() < 50_000
                    && m.points
                        .last()
                        .is_none_or(|last| (last.0 - p.0).abs() + (last.1 - p.1).abs() >= 1.0)
                {
                    m.points.push(p);
                }
            } else {
                m.points.truncate(1);
                m.points.push(p);
            }
            self.repaint(hwnd);
        } else {
            let hover = self.action_at(p);
            if hover != self.hover {
                self.hover = hover;
                self.repaint(hwnd);
            }
        }
    }
    unsafe fn pointer_up(&mut self, hwnd: HWND, p: (i32, i32)) {
        if self.drag.is_some() || self.draft.is_some() {
            self.pointer_move(hwnd, p);
            self.drag = None;
            if let Some(m) = self.draft.take() {
                self.history.push(m);
            }
            let _ = ReleaseCapture();
            self.schedule_ocr(hwnd);
            let _ = self.update_panel(hwnd);
            self.repaint(hwnd);
        }
    }
}

unsafe extern "system" fn procedure(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_NCCREATE {
        let c = &*(lparam.0 as *const CREATESTRUCTW);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, c.lpCreateParams as isize);
        return DefWindowProcW(hwnd, msg, wparam, lparam);
    }
    if msg == WM_NCDESTROY {
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
        return DefWindowProcW(hwnd, msg, wparam, lparam);
    }
    if msg == WM_DESTROY {
        PostQuitMessage(0);
        return LRESULT(0);
    }
    if msg == WM_ERASEBKGND {
        return LRESULT(1);
    }
    let raw = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *const RefCell<CaptureUi>;
    if raw.is_null() {
        return DefWindowProcW(hwnd, msg, wparam, lparam);
    }
    let Ok(mut s) = (*raw).try_borrow_mut() else {
        return DefWindowProcW(hwnd, msg, wparam, lparam);
    };
    let p = (
        (lparam.0 as u16 as i16) as i32,
        ((lparam.0 >> 16) as u16 as i16) as i32,
    );
    match msg {
        WM_SETCURSOR if wparam.0 == hwnd.0 as usize && lparam.0 as u16 == HTCLIENT as u16 => {
            let mut position = POINT::default();
            if GetCursorPos(&mut position).is_ok() && ScreenToClient(hwnd, &mut position).as_bool()
            {
                s.update_cursor((position.x, position.y));
                return LRESULT(1);
            }
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }
        WM_PAINT => {
            let mut ps = PAINTSTRUCT::default();
            BeginPaint(hwnd, &mut ps);
            let outcome = s.renderer.as_ref().map(|r| r.draw(&s));
            let _ = EndPaint(hwnd, &ps);
            if let Some(Err(e)) = outcome {
                s.fatal = Some(e);
                s.close(hwnd);
            } else if s.ready_ms.is_none() && IsWindowVisible(hwnd).as_bool() {
                let _ = DwmFlush();
                let ready = s.started.elapsed().as_millis() as u64;
                s.ready_ms = Some(ready);
                let _ = s.app.emit(
                    "native-capture-ready",
                    NativeCaptureResult {
                        action: "ready".into(),
                        capture_ms: s.capture_ms,
                        prepare_ms: s.prepare_ms,
                        ready_ms: ready,
                        path: None,
                    },
                );
            }
            LRESULT(0)
        }
        WM_CTLCOLORSTATIC | WM_CTLCOLOREDIT => {
            let edit = HWND(lparam.0 as *mut _);
            if s.panel_edit == Some(edit)
                || s.panel_edit2 == Some(edit)
                || s.text_edit == Some(edit)
            {
                let dc = HDC(wparam.0 as *mut _);
                let rgb = if s.text_edit == Some(edit) {
                    s.color
                } else {
                    0x343a4b
                };
                SetTextColor(
                    dc,
                    COLORREF(((rgb >> 16) & 255) | (rgb & 0xff00) | ((rgb & 255) << 16)),
                );
                SetBkColor(dc, COLORREF(0xffffff));
                LRESULT(GetStockObject(WHITE_BRUSH).0 as isize)
            } else {
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
        }
        WM_LBUTTONDOWN => {
            if let Err(e) = s.pointer_down(hwnd, p) {
                s.notice = Some(e);
                s.repaint(hwnd);
            }
            LRESULT(0)
        }
        WM_MOUSELEAVE => {
            s.hover = None;
            s.repaint(hwnd);
            LRESULT(0)
        }
        WM_MOUSEMOVE => {
            let _ = TrackMouseEvent(&mut TRACKMOUSEEVENT {
                cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                dwFlags: TME_LEAVE,
                hwndTrack: hwnd,
                dwHoverTime: 0,
            });
            s.pointer_move(hwnd, p);
            // WM_SETCURSOR is not sent while this window owns mouse capture.
            s.update_cursor(p);
            LRESULT(0)
        }
        WM_LBUTTONUP => {
            s.pointer_up(hwnd, p);
            s.update_cursor(p);
            LRESULT(0)
        }
        WM_LBUTTONDBLCLK => {
            if !s.toolbar && s.selection.is_some_and(|r| r.contains(p)) {
                if let Err(e) = s.act(hwnd, Action::Done) {
                    s.notice = Some(e);
                    s.repaint(hwnd);
                }
            }
            LRESULT(0)
        }
        WM_KEYDOWN => {
            let ctrl = (GetKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
            let shift = (GetKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;
            if wparam.0 == 27 && s.counting.is_some() {
                s.counting = None;
                let _ = KillTimer(Some(hwnd), COUNTDOWN);
                s.repaint(hwnd);
                return LRESULT(0);
            }
            let action = match wparam.0 {
                27 => Some(if s.toolbar {
                    Action::Stop
                } else {
                    Action::Cancel
                }),
                13 => Some(Action::Done),
                0x43 if ctrl => Some(Action::Done),
                0x53 if ctrl => Some(Action::Save),
                0x5a if ctrl => Some(if shift { Action::Redo } else { Action::Undo }),
                0x59 if ctrl => Some(Action::Redo),
                0x56 if !ctrl => Some(Action::Select),
                0x50 if !ctrl => Some(Action::Pen),
                0x41 if !ctrl => Some(Action::Arrow),
                0x52 if !ctrl => Some(Action::Rectangle),
                0x4f if !ctrl => Some(Action::Ellipse),
                0x54 if !ctrl => Some(Action::Text),
                0x4d if !ctrl => Some(Action::Mosaic),
                0x4e if !ctrl => Some(Action::Step),
                _ => None,
            };
            if let Some(a) = action {
                if let Err(e) = s.act(hwnd, a) {
                    s.notice = Some(e);
                    s.repaint(hwnd);
                }
            }
            LRESULT(0)
        }
        WM_RBUTTONUP | WM_CLOSE => {
            s.close(hwnd);
            LRESULT(0)
        }
        WM_TIMER => {
            match wparam.0 {
                COUNTDOWN => {
                    if let Some(n) = s.counting {
                        if n <= 1 {
                            if let Err(e) = s.record_begin(hwnd) {
                                s.fatal = Some(e);
                                s.close(hwnd);
                            }
                        } else {
                            s.counting = Some(n - 1);
                            s.repaint(hwnd);
                        }
                    }
                }
                OCR_TIMER => {
                    let _ = KillTimer(Some(hwnd), OCR_TIMER);
                    let tr = s.options.auto_translate && s.options.ai_enabled;
                    if let Err(e) = s.ocr(hwnd, tr) {
                        s.notice = Some(e);
                        s.repaint(hwnd);
                    }
                }
                CLOCK => {
                    if !s.stopping && s.recording.is_some() {
                        if let Ok(status) = super::tools::recording_snapshot(&s.app) {
                            if !status.active || status.error.is_some() {
                                s.stopping = true;
                                let app = s.app.clone();
                                let id = s.options.id.clone();
                                tauri::async_runtime::spawn_blocking(move || {
                                    match super::tools::stop_recording(&app) {
                                        Ok(r) => {
                                            service::post_for(&app, &id, Message::Recording(r))
                                        }
                                        Err(e) => service::post_for(&app, &id, Message::Failure(e)),
                                    }
                                });
                            }
                        }
                        s.repaint(hwnd);
                    }
                }
                _ => {}
            }
            LRESULT(0)
        }
        service::NOTIFY => {
            s.notify(hwnd);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

struct Com;
impl Drop for Com {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}
struct Window(HWND);
impl Drop for Window {
    fn drop(&mut self) {
        unsafe {
            if IsWindow(Some(self.0)).as_bool() {
                let _ = DestroyWindow(self.0);
            }
        }
    }
}
struct Active;
impl Drop for Active {
    fn drop(&mut self) {
        ACTIVE.store(false, Ordering::Release);
    }
}
struct Dpi(DPI_AWARENESS_CONTEXT);
impl Drop for Dpi {
    fn drop(&mut self) {
        if !self.0 .0.is_null() {
            unsafe {
                SetThreadDpiAwarenessContext(self.0);
            }
        }
    }
}

pub fn run_editor(app: AppHandle, options: Options) -> Result<NativeCaptureResult, String> {
    ACTIVE
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| "请先完成当前截图或录屏".to_string())?;
    let _active = Active;
    let started = Instant::now();
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(|e| e.to_string())?;
        let _com = Com;
        let _dpi = Dpi(SetThreadDpiAwarenessContext(
            DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        ));
        let previous = GetForegroundWindow();
        // An early window-creation/render error can leave WM_QUIT on a reused
        // Tokio worker. Never let that cancel the next capture.
        let mut pending = MSG::default();
        while PeekMessageW(&mut pending, None, WM_QUIT, WM_QUIT, PM_REMOVE).as_bool() {}
        let frame = desktop_snapshot::capture(options.display_id)?;
        let capture_ms = started.elapsed().as_millis() as u64;
        let instance = HINSTANCE(GetModuleHandleW(None).map_err(|e| e.to_string())?.0);
        CLASS
            .get_or_init(|| {
                let a = RegisterClassW(&WNDCLASSW {
                    style: CS_DBLCLKS,
                    lpfnWndProc: Some(procedure),
                    hInstance: instance,
                    hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
                    lpszClassName: w!("MyAssistantNativeCapture"),
                    ..Default::default()
                });
                if a == 0 {
                    Err(windows::core::Error::from_thread().to_string())
                } else {
                    Ok(a)
                }
            })
            .as_ref()
            .map_err(Clone::clone)?;
        let mut state = Box::new(RefCell::new(CaptureUi {
            app: app.clone(),
            options: options.clone(),
            frame,
            renderer: None,
            scale: 1.0,
            selection: None,
            drag: None,
            tool: Tool::Select,
            history: History::default(),
            draft: None,
            color: 0xff4d5a,
            width: 4.0,
            custom_colors: [0; 16],
            text_edit: None,
            text_origin: None,
            text_font: None,
            panel_edit: None,
            panel_edit2: None,
            panel_font: None,
            revision: 0,
            panel_open: false,
            panel_dismissed: false,
            translate: false,
            loading: false,
            recognized: String::new(),
            translated: String::new(),
            ocr_error: String::new(),
            notice: None,
            hover: None,
            counting: None,
            toolbar: false,
            recording: None,
            stopping: false,
            record_pending: false,
            frozen_seconds: 0,
            border: None,
            started,
            capture_ms,
            prepare_ms: 0,
            ready_ms: None,
            action: "cancelled".into(),
            path: None,
            closing: false,
            fatal: None,
        }));
        let f = &state.get_mut().frame;
        let (x, y, width, height) = (f.x, f.y, f.width, f.height);
        let window = Window(
            CreateWindowExW(
                WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
                w!("MyAssistantNativeCapture"),
                w!("小助手 · 屏幕捕获"),
                WS_POPUP | WS_CLIPCHILDREN,
                x,
                y,
                width as i32,
                height as i32,
                None,
                None,
                Some(instance),
                Some((&*state as *const RefCell<CaptureUi>).cast()),
            )
            .map_err(|e| e.to_string())?,
        );
        let disabled = 1i32;
        let _ = DwmSetWindowAttribute(
            window.0,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            (&disabled as *const i32).cast(),
            4,
        );
        let _ = SetWindowDisplayAffinity(window.0, WDA_EXCLUDEFROMCAPTURE);
        service::attach(&app, &options, window.0);
        let scale = (GetDpiForWindow(window.0) as f32 / 96.0).max(1.0);
        state.get_mut().scale = scale;
        state.get_mut().renderer = Some(Renderer::new(window.0, &state.get_mut().frame, scale)?);
        state.get_mut().prepare_ms = started.elapsed().as_millis() as u64;
        let _ = ShowWindow(window.0, SW_SHOWNORMAL);
        let _ = SetForegroundWindow(window.0);
        let _ = InvalidateRect(Some(window.0), None, false);
        let _ = UpdateWindow(window.0);
        let mut msg = MSG::default();
        loop {
            let status = GetMessageW(&mut msg, None, 0, 0).0;
            if status == -1 {
                return Err(windows::core::Error::from_thread().to_string());
            }
            if status == 0 {
                break;
            }
            if msg.message == WM_KEYDOWN {
                let is_edit = state.borrow().text_edit == Some(msg.hwnd);
                if is_edit
                    && (msg.wParam.0 == 27
                        || (msg.wParam.0 == 13
                            && (GetKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0))
                {
                    state.borrow_mut().commit_text(window.0);
                    state.borrow().repaint(window.0);
                    continue;
                }
                if (state.borrow().panel_edit == Some(msg.hwnd)
                    || state.borrow().panel_edit2 == Some(msg.hwnd))
                    && msg.wParam.0 == 27
                {
                    state.borrow_mut().close(window.0);
                    continue;
                }
            }
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
            // A native modal dialog may consume WM_QUIT while its owner closes.
            // Do not enter another blocking GetMessage for a destroyed editor.
            if !IsWindow(Some(window.0)).as_bool() {
                break;
            }
        }
        let mut s = state.borrow_mut();
        if let Some(f) = s.text_font.take() {
            let _ = DeleteObject(HGDIOBJ(f.0));
        }
        if let Some(f) = s.panel_font.take() {
            let _ = DeleteObject(HGDIOBJ(f.0));
        }
        if GetForegroundWindow().0.is_null()
            && IsWindow(Some(previous)).as_bool()
            && !IsIconic(previous).as_bool()
        {
            let _ = SetForegroundWindow(previous);
        }
        if let Some(e) = &s.fatal {
            return Err(e.clone());
        }
        Ok(NativeCaptureResult {
            action: s.action.clone(),
            capture_ms,
            prepare_ms: s.prepare_ms,
            ready_ms: s.ready_ms.unwrap_or(0),
            path: s.path.clone(),
        })
    }
}

unsafe fn font(height: i32) -> HFONT {
    CreateFontW(
        -height,
        0,
        0,
        0,
        400,
        0,
        0,
        0,
        DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS,
        CLIP_DEFAULT_PRECIS,
        CLEARTYPE_QUALITY,
        0,
        w!("Microsoft YaHei UI"),
    )
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn last_region(app: &AppHandle, frame: &DesktopFrame) -> Option<Selection> {
    let key = format!("native-region-{}x{}", frame.width, frame.height);
    let s: Selection = serde_json::from_str(&super::get_setting(app.clone(), key).ok()??).ok()?;
    editor::crop(frame, s).ok()?;
    Some(s)
}
fn remember_region(app: &AppHandle, frame: &DesktopFrame, s: Selection) {
    if let Ok(conn) = super::db(app) {
        let _ = super::store_setting(
            &conn,
            &format!("native-region-{}x{}", frame.width, frame.height),
            &serde_json::to_string(&s).unwrap_or_default(),
        );
    }
}
fn atomic_write(path: &str, bytes: &[u8]) -> Result<(), String> {
    let p = std::path::Path::new(path);
    let temporary = p.with_file_name(format!(".capture-save-{}.part", uuid::Uuid::new_v4()));
    let r = std::fs::write(&temporary, bytes)
        .and_then(|_| std::fs::rename(&temporary, p))
        .map_err(|e| e.to_string());
    if r.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    r
}
unsafe fn save_dialog(hwnd: HWND, options: &Options) -> Result<Option<String>, String> {
    let dialog: IFileSaveDialog =
        CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
    dialog
        .SetOptions(FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_OVERWRITEPROMPT)
        .map_err(|e| e.to_string())?;
    dialog
        .SetDefaultExtension(w!("png"))
        .map_err(|e| e.to_string())?;
    dialog
        .SetFileTypes(&[COMDLG_FILTERSPEC {
            pszName: w!("PNG"),
            pszSpec: w!("*.png"),
        }])
        .map_err(|e| e.to_string())?;
    dialog
        .SetFileName(&HSTRING::from(format!("Screenshot-{}.png", now_ms())))
        .map_err(|e| e.to_string())?;
    if !options.screenshot_directory.is_empty() {
        if let Ok(folder) = SHCreateItemFromParsingName::<_, _, IShellItem>(
            &HSTRING::from(&options.screenshot_directory),
            None,
        ) {
            let _ = dialog.SetFolder(&folder);
        }
    }
    if let Err(e) = dialog.Show(Some(hwnd)) {
        if e.code().0 == 0x800704C7u32 as i32 {
            return Ok(None);
        }
        return Err(e.to_string());
    }
    let name = dialog
        .GetResult()
        .map_err(|e| e.to_string())?
        .GetDisplayName(SIGDN_FILESYSPATH)
        .map_err(|e| e.to_string())?;
    let path = name.to_string().map_err(|e| e.to_string());
    CoTaskMemFree(Some(name.0.cast()));
    let mut path = path?;
    if std::path::Path::new(&path).extension().is_none() {
        path.push_str(".png");
    }
    if !path.to_ascii_lowercase().ends_with(".png") {
        return Err("请使用 .png 文件扩展名".into());
    }
    Ok(Some(path))
}
unsafe fn recording_border(
    frame: &DesktopFrame,
    s: Selection,
    scale: f32,
) -> Result<Window, String> {
    let instance = HINSTANCE(GetModuleHandleW(None).map_err(|e| e.to_string())?.0);
    BORDER_CLASS
        .get_or_init(|| {
            let a = RegisterClassW(&WNDCLASSW {
                lpfnWndProc: Some(border_procedure),
                hInstance: instance,
                hbrBackground: CreateSolidBrush(COLORREF(0xe88c9b)),
                lpszClassName: w!("MyAssistantRecordingBorder"),
                ..Default::default()
            });
            if a == 0 {
                Err(windows::core::Error::from_thread().to_string())
            } else {
                Ok(a)
            }
        })
        .as_ref()
        .map_err(Clone::clone)?;
    let window = Window(
        CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT,
            w!("MyAssistantRecordingBorder"),
            w!("录制区域"),
            WS_POPUP,
            frame.x + s.x as i32,
            frame.y + s.y as i32,
            s.width as i32,
            s.height as i32,
            None,
            None,
            Some(instance),
            None,
        )
        .map_err(|e| e.to_string())?,
    );
    let t = (2.0 * scale) as i32;
    let outer = CreateRectRgn(0, 0, s.width as i32, s.height as i32);
    let inner = CreateRectRgn(t, t, s.width as i32 - t, s.height as i32 - t);
    CombineRgn(Some(outer), Some(outer), Some(inner), RGN_DIFF);
    let _ = DeleteObject(HGDIOBJ(inner.0));
    if SetWindowRgn(window.0, Some(outer), true) == 0 {
        let _ = DeleteObject(HGDIOBJ(outer.0));
    }
    let _ = SetWindowDisplayAffinity(window.0, WDA_EXCLUDEFROMCAPTURE);
    let _ = ShowWindow(window.0, SW_SHOWNOACTIVATE);
    Ok(window)
}

struct Memory(HGLOBAL);
impl Memory {
    unsafe fn new(bytes: &[u8]) -> Result<Self, String> {
        let m = Self(
            GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes.len()).map_err(|e| e.to_string())?,
        );
        let p = GlobalLock(m.0);
        if p.is_null() {
            return Err("无法访问剪贴板缓冲区".into());
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), p.cast(), bytes.len());
        let _ = GlobalUnlock(m.0);
        Ok(m)
    }
    unsafe fn publish(mut self, format: u32) -> Result<(), String> {
        SetClipboardData(format, Some(HANDLE(self.0 .0))).map_err(|e| e.to_string())?;
        self.0 = HGLOBAL::default();
        Ok(())
    }
}
impl Drop for Memory {
    fn drop(&mut self) {
        if !self.0 .0.is_null() {
            unsafe {
                let _ = GlobalFree(Some(self.0));
            }
        }
    }
}
struct Clipboard;
impl Drop for Clipboard {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseClipboard();
        }
    }
}
unsafe fn copy_image(hwnd: HWND, image: &Image) -> Result<(), String> {
    let mut dib = Vec::with_capacity(40 + image.bgra.len());
    for n in [
        40,
        image.width,
        (-(image.height as i32)) as u32,
        0x0020_0001,
        0,
        image.bgra.len() as u32,
        0,
        0,
        0,
        0,
    ] {
        dib.extend_from_slice(&n.to_le_bytes());
    }
    dib.extend_from_slice(&image.bgra);
    let dib = Memory::new(&dib)?;
    let png = Memory::new(&image.png()?)?;
    OpenClipboard(Some(hwnd)).map_err(|e| e.to_string())?;
    let _clip = Clipboard;
    EmptyClipboard().map_err(|e| e.to_string())?;
    dib.publish(8)?;
    let f = RegisterClipboardFormatW(w!("PNG"));
    if f != 0 {
        let _ = png.publish(f);
    }
    Ok(())
}
unsafe fn copy_text(hwnd: HWND, text: &str) -> Result<(), String> {
    let bytes = text
        .encode_utf16()
        .chain(Some(0))
        .flat_map(u16::to_le_bytes)
        .collect::<Vec<_>>();
    let memory = Memory::new(&bytes)?;
    OpenClipboard(Some(hwnd)).map_err(|e| e.to_string())?;
    let _clip = Clipboard;
    EmptyClipboard().map_err(|e| e.to_string())?;
    memory.publish(13)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reverse_drag_clamps_and_rejects_tiny() {
        assert_eq!(
            Selection::between((20, 30), (-4, 1000), 100, 80),
            Some(Selection {
                x: 0,
                y: 30,
                width: 20,
                height: 50
            })
        );
        assert!(Selection::between((0, 0), (1, 10), 100, 80).is_none());
    }
}

unsafe extern "system" fn border_procedure(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    DefWindowProcW(hwnd, msg, wparam, lparam)
}
