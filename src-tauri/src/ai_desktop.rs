//! Optional Windows desktop tools for explicitly authorized, vision-enabled agents.
use serde_json::{json, Value};

pub fn definitions() -> Vec<Value> {
    if !cfg!(windows) {
        return vec![];
    }
    let spec = |name: &str, description: &str, properties: Value, required: &[&str]| json!({"type":"function","function":{"name":name,"description":description,"parameters":{"type":"object","properties":properties,"required":required,"additionalProperties":false}}});
    vec![
        spec("agent_desktop_windows","List visible top-level windows, their handles and physical bounds. Use the actual returned handle for subsequent actions.",json!({}),&[]),
        spec("agent_desktop_capture","Capture a selected monitor and send that image to the configured vision model. The returned image dimensions and scale map to physical desktop coordinates.",json!({"display":{"type":"integer","minimum":1,"maximum":16}}),&["display"]),
        spec("agent_desktop_activate","Bring an explicitly selected visible window to the foreground.",json!({"window":{"type":"integer"}}),&["window"]),
        spec("agent_desktop_click","Click physical client coordinates within a visible selected window. Fails if another window covers the point. Inspect a fresh screenshot first.",json!({"window":{"type":"integer"},"x":{"type":"integer"},"y":{"type":"integer"}}),&["window","x","y"]),
        spec("agent_desktop_type","Type literal Unicode text into the focused control of the selected foreground window. Check focus and screen content before typing.",json!({"window":{"type":"integer"},"text":{"type":"string","maxLength":4000}}),&["window","text"]),
        spec("agent_desktop_key","Send a keyboard shortcut to the selected foreground window. Supported keys: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight and A-Z with optional Ctrl, Alt or Shift.",json!({"window":{"type":"integer"},"key":{"type":"string"}}),&["window","key"]),
    ]
}
#[cfg(not(windows))]
pub fn execute(_name: &str, _args: &Value) -> Result<Value, String> {
    Err("当前平台尚未提供桌面控制工具".into())
}
#[cfg(windows)]
pub fn execute(name: &str, args: &Value) -> Result<Value, String> {
    windows_tools::execute(name, args)
}

#[cfg(windows)]
mod windows_tools {
    use super::*;
    use base64::Engine;
    use windows::core::BOOL;
    use windows::Win32::{
        Foundation::{HWND, LPARAM, POINT, RECT},
        Graphics::Gdi::ClientToScreen,
        UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
    };
    unsafe extern "system" fn enumerate(hwnd: HWND, data: LPARAM) -> BOOL {
        unsafe {
            if IsWindowVisible(hwnd).as_bool() && GetWindowTextLengthW(hwnd) > 0 {
                let mut title = [0u16; 1024];
                let n = GetWindowTextW(hwnd, &mut title);
                let mut rect = RECT::default();
                if GetWindowRect(hwnd, &mut rect).is_ok() {
                    let entries = &mut *(data.0 as *mut Vec<Value>);
                    if entries.len() < 150 {
                        entries.push(json!({"window":hwnd.0 as usize,"title":String::from_utf16_lossy(&title[..n.max(0)as usize]),"x":rect.left,"y":rect.top,"width":rect.right-rect.left,"height":rect.bottom-rect.top}));
                    }
                }
            }
            BOOL(1)
        }
    }
    fn target(args: &Value) -> Result<HWND, String> {
        let raw = args["window"].as_u64().ok_or("缺少窗口编号")?;
        let hwnd = HWND(raw as usize as *mut _);
        if !unsafe { IsWindow(Some(hwnd)) }.as_bool() || !unsafe { IsWindowVisible(hwnd) }.as_bool()
        {
            return Err("目标窗口已关闭或不可见，请重新读取窗口列表".into());
        }
        Ok(hwnd)
    }
    fn foreground(hwnd: HWND) -> Result<(), String> {
        unsafe {
            if GetForegroundWindow() != hwnd {
                let _ = ShowWindow(hwnd, SW_RESTORE);
                if !SetForegroundWindow(hwnd).as_bool() {
                    return Err("无法聚焦目标窗口，请手动激活后重试".into());
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(80));
        if unsafe { GetForegroundWindow() } != hwnd {
            return Err("目标窗口没有获得焦点，输入取消".into());
        }
        Ok(())
    }
    fn key(vk: VIRTUAL_KEY, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    dwFlags: if up {
                        KEYEVENTF_KEYUP
                    } else {
                        KEYBD_EVENT_FLAGS(0)
                    },
                    ..Default::default()
                },
            },
        }
    }
    fn send(inputs: &[INPUT]) -> Result<(), String> {
        if unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32) } != inputs.len() as u32
        {
            Err("系统拒绝了输入，目标程序可能使用更高的权限".into())
        } else {
            Ok(())
        }
    }
    pub fn execute(name: &str, args: &Value) -> Result<Value, String> {
        if name == "agent_desktop_windows" {
            let mut entries = Vec::<Value>::new();
            unsafe {
                EnumWindows(Some(enumerate), LPARAM(&mut entries as *mut _ as isize))
                    .map_err(|e| e.to_string())?;
            }
            return Ok(json!({"windows":entries}));
        }
        if name == "agent_desktop_capture" {
            let display = args["display"]
                .as_u64()
                .filter(|v| (1..=16).contains(v))
                .ok_or("显示器编号无效")?;
            let frame = super::super::desktop_snapshot::capture(display as usize)?;
            let factor = (frame.width.max(frame.height) as f64 / 1600.0).max(1.0);
            let width = (frame.width as f64 / factor).round() as u32;
            let height = (frame.height as f64 / factor).round() as u32;
            let mut rgba = vec![0u8; (width * height * 4) as usize];
            for y in 0..height {
                for x in 0..width {
                    let sx = ((x as f64 * factor) as u32).min(frame.width - 1);
                    let sy = ((y as f64 * factor) as u32).min(frame.height - 1);
                    let from = ((sy * frame.width + sx) * 4) as usize;
                    let to = ((y * width + x) * 4) as usize;
                    rgba[to..to + 4].copy_from_slice(&[
                        frame.bgra[from + 2],
                        frame.bgra[from + 1],
                        frame.bgra[from],
                        255,
                    ]);
                }
            }
            let png = super::super::desktop_snapshot::encode(&rgba, width, height)?;
            let image = base64::engine::general_purpose::STANDARD.encode(png);
            return Ok(
                json!({"image_url":format!("data:image/png;base64,{image}"),"display":display,"x":frame.x,"y":frame.y,"physicalWidth":frame.width,"physicalHeight":frame.height,"imageWidth":width,"imageHeight":height,"scale":factor,"message":"桌面截图已提供给当前视觉模型"}),
            );
        }
        let hwnd = target(args)?;
        foreground(hwnd)?;
        match name {
            "agent_desktop_activate" => {}
            "agent_desktop_click" => {
                let x = args["x"]
                    .as_i64()
                    .and_then(|v| i32::try_from(v).ok())
                    .ok_or("点击坐标无效")?;
                let y = args["y"]
                    .as_i64()
                    .and_then(|v| i32::try_from(v).ok())
                    .ok_or("点击坐标无效")?;
                let mut rect = RECT::default();
                unsafe {
                    GetClientRect(hwnd, &mut rect).map_err(|e| e.to_string())?;
                }
                if x < 0 || y < 0 || x >= rect.right || y >= rect.bottom {
                    return Err("点击点不在目标窗口客户区内".into());
                }
                let mut point = POINT { x, y };
                unsafe {
                    if !ClientToScreen(hwnd, &mut point).as_bool() {
                        return Err("无法换算窗口坐标".into());
                    }
                    let covered = WindowFromPoint(point);
                    if GetAncestor(covered, GA_ROOT) != hwnd {
                        return Err("点击位置被其他窗口遮挡，操作取消".into());
                    }
                    SetCursorPos(point.x, point.y).map_err(|e| e.to_string())?;
                }
                send(&[
                    INPUT {
                        r#type: INPUT_MOUSE,
                        Anonymous: INPUT_0 {
                            mi: MOUSEINPUT {
                                dwFlags: MOUSEEVENTF_LEFTDOWN,
                                ..Default::default()
                            },
                        },
                    },
                    INPUT {
                        r#type: INPUT_MOUSE,
                        Anonymous: INPUT_0 {
                            mi: MOUSEINPUT {
                                dwFlags: MOUSEEVENTF_LEFTUP,
                                ..Default::default()
                            },
                        },
                    },
                ])?;
            }
            "agent_desktop_type" => {
                let text = args["text"]
                    .as_str()
                    .filter(|s| s.chars().count() <= 4000)
                    .ok_or("输入文本过长")?;
                let mut inputs = vec![];
                for unit in text.encode_utf16() {
                    for flags in [KEYEVENTF_UNICODE, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP] {
                        inputs.push(INPUT {
                            r#type: INPUT_KEYBOARD,
                            Anonymous: INPUT_0 {
                                ki: KEYBDINPUT {
                                    wScan: unit,
                                    dwFlags: flags,
                                    ..Default::default()
                                },
                            },
                        });
                    }
                }
                send(&inputs)?;
            }
            "agent_desktop_key" => {
                let text = args["key"].as_str().ok_or("缺少按键")?;
                let parts = text.split('+').collect::<Vec<_>>();
                if parts.len() > 4 {
                    return Err("按键组合过长".into());
                }
                let mut modifiers = vec![];
                for part in &parts[..parts.len().saturating_sub(1)] {
                    let vk = match *part {
                        "Ctrl" => VK_CONTROL,
                        "Alt" => VK_MENU,
                        "Shift" => VK_SHIFT,
                        _ => return Err("不支持的修饰键".into()),
                    };
                    if modifiers.contains(&vk) {
                        return Err("修饰键重复".into());
                    }
                    modifiers.push(vk);
                }
                let last = parts.last().copied().unwrap_or_default();
                let vk = match last {
                    "Enter" => VK_RETURN,
                    "Tab" => VK_TAB,
                    "Escape" => VK_ESCAPE,
                    "Backspace" => VK_BACK,
                    "Delete" => VK_DELETE,
                    "ArrowUp" => VK_UP,
                    "ArrowDown" => VK_DOWN,
                    "ArrowLeft" => VK_LEFT,
                    "ArrowRight" => VK_RIGHT,
                    s if s.len() == 1 && s.as_bytes()[0].is_ascii_alphabetic() => {
                        VIRTUAL_KEY(s.as_bytes()[0].to_ascii_uppercase() as u16)
                    }
                    _ => return Err("不支持的按键".into()),
                };
                let mut inputs = modifiers.iter().map(|m| key(*m, false)).collect::<Vec<_>>();
                inputs.extend([key(vk, false), key(vk, true)]);
                inputs.extend(modifiers.iter().rev().map(|m| key(*m, true)));
                send(&inputs)?;
            }
            _ => return Err("未知桌面工具".into()),
        }
        Ok(json!({"window":hwnd.0 as usize,"success":true}))
    }
}
