use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize};

// Require a usable piece of the title bar, including on monitors left of the primary.
fn reachable(x: i32, y: i32, width: u32, height: u32, screens: &[(i32, i32, u32, u32)]) -> bool {
    let (x, y) = (i64::from(x), i64::from(y));
    screens.iter().any(|&(sx, sy, sw, sh)| {
        let horizontal = (x + i64::from(width)).min(i64::from(sx) + i64::from(sw)) - x.max(i64::from(sx));
        let vertical = (y + i64::from(height.min(60))).min(i64::from(sy) + i64::from(sh)) - y.max(i64::from(sy));
        horizontal >= 64 && vertical >= 24
    })
}

pub fn position_reachable(window: &tauri::WebviewWindow, x: i32, y: i32) -> Result<bool, String> {
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let screens = window.available_monitors().map_err(|e| e.to_string())?.into_iter()
        .map(|m| (m.position().x, m.position().y, m.size().width, m.size().height)).collect::<Vec<_>>();
    Ok(reachable(x, y, size.width, size.height, &screens))
}

pub fn restore_position(app: &AppHandle, x: Option<i32>, y: Option<i32>) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("小助手窗口不存在")?;
    let current = window.outer_position().map_err(|e| e.to_string())?;
    let target = PhysicalPosition::new(x.unwrap_or(current.x), y.unwrap_or(current.y));
    if position_reachable(&window, target.x, target.y)? {
        if target != current { window.set_position(target).map_err(|e| e.to_string())?; }
    } else {
        // Center on the primary monitor explicitly: current monitor can be absent off-screen.
        if let Some(m) = window.primary_monitor().map_err(|e| e.to_string())? {
            let PhysicalSize { width, height } = window.outer_size().map_err(|e| e.to_string())?;
            window.set_position(PhysicalPosition::new(
                m.position().x + (m.size().width.saturating_sub(width) / 2) as i32,
                m.position().y + (m.size().height.saturating_sub(height) / 2) as i32,
            )).map_err(|e| e.to_string())?;
        } else { window.center().map_err(|e| e.to_string())?; }
    }
    Ok(())
}

pub fn show(app: &AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("小助手窗口不存在")?;
    window.unminimize().map_err(|e| e.to_string())?;
    restore_position(app, None, None)?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::reachable;
    #[test]
    fn rejects_minimized_and_disconnected_display_positions() {
        let screens = [(0, 0, 3840, 2160)];
        assert!(!reachable(-21333, -21333, 645, 930, &screens));
        assert!(!reachable(-32000, -32000, 645, 930, &screens));
        assert!(!reachable(5000, 100, 645, 930, &screens));
        assert!(!reachable(100, -900, 645, 930, &screens));
        assert!(reachable(100, 100, 645, 930, &screens));
    }
    #[test]
    fn supports_negative_monitor_coordinates_and_small_orb() {
        let screens = [(-1920, 0, 1920, 1080), (0, 0, 3840, 2160)];
        assert!(reachable(-1800, 100, 184, 184, &screens));
        assert!(reachable(-30, 10, 184, 184, &screens));
    }
}
