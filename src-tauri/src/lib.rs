use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use std::path::Path;
use std::process::Command;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;
mod tools;
mod capture_workspace;
mod window_recovery;

#[tauri::command]
fn set_tray_recording(app: AppHandle, active: bool) -> Result<(), String> {
    let show = MenuItem::with_id(&app, "show", "显示小助手", true, None::<&str>).map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(&app, "quit", "退出", true, None::<&str>).map_err(|e| e.to_string())?;
    let stop = MenuItem::with_id(&app, "stop-recording", "结束录屏并预览", true, None::<&str>).map_err(|e| e.to_string())?;
    let menu = if active { Menu::with_items(&app, &[&show, &stop, &quit]) } else { Menu::with_items(&app, &[&show, &quit]) }.map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id("assistant") { tray.set_menu(Some(menu)).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
fn restore_main_position(app: AppHandle, x: Option<i32>, y: Option<i32>) -> Result<(), String> {
    window_recovery::restore_position(&app, x, y)
}

#[tauri::command]
fn persist_main_position(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("小助手窗口不存在")?;
    if window.is_minimized().map_err(|e| e.to_string())? || !window_recovery::position_reachable(&window, x, y)? { return Ok(()); }
    let mut conn = db(&app)?;
    let transaction = conn.transaction().map_err(|e| e.to_string())?;
    for (key, value) in [("window_x", x), ("window_y", y)] {
        transaction.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key,value.to_string()]).map_err(|e| e.to_string())?;
    }
    transaction.commit().map_err(|e| e.to_string())
}

fn show_from_tray(app: &AppHandle) {
    if let Err(error) = window_recovery::show(app) { eprintln!("恢复小助手失败：{error}"); }
    let _ = app.emit("assistant-show", ());
}

static DATABASE_READY: OnceLock<Result<(), String>> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Todo {
    id: i64,
    text: String,
    completed: bool,
    created_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Note {
    id: i64,
    content: String,
    created_at: i64,
    updated_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Launcher {
    id: i64,
    computer_id: String,
    kind: String,
    name: String,
    target: String,
    editor: Option<String>,
    last_opened_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ComputerProfile {
    id: String,
    name: String,
    platform: String,
    is_current: bool,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn db(app: &AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut conn = Connection::open(dir.join("assistant.db")).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(2))
        .map_err(|e| e.to_string())?;
    DATABASE_READY.get_or_init(|| initialize_schema(&mut conn)).clone()?;
    Ok(conn)
}

fn initialize_schema(conn: &mut Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY,
            text TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS computer_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            platform TEXT NOT NULL CHECK(platform IN ('windows','macos','linux')),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS local_binding (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            installation_id TEXT NOT NULL,
            computer_id TEXT NOT NULL REFERENCES computer_profiles(id)
        );",
    )
    .map_err(|e| e.to_string())?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
    let current: Option<String> = tx
        .query_row("SELECT computer_id FROM local_binding WHERE singleton=1", [], |r| r.get(0))
        .optional().map_err(|e| e.to_string())?;
    let current_id = if let Some(id) = current { id } else {
        let id = Uuid::new_v4().to_string();
        let name = std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME"))
            .ok().filter(|name| !name.trim().is_empty()).unwrap_or_else(|| "这台电脑".into());
        let platform = if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "macos") { "macos" } else { "linux" };
        tx.execute("INSERT INTO computer_profiles(id,name,platform,created_at,updated_at) VALUES(?1,?2,?3,?4,?4)",
            params![id, name, platform, now_ms()]).map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO local_binding(singleton,installation_id,computer_id) VALUES(1,?1,?2)",
            params![Uuid::new_v4().to_string(), id]).map_err(|e| e.to_string())?;
        id
    };
    let legacy_exists: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='launchers')", [], |r| r.get(0)
    ).map_err(|e| e.to_string())?;
    let has_computer_id = if legacy_exists {
        let mut stmt = tx.prepare("PRAGMA table_info(launchers)").map_err(|e| e.to_string())?;
        let columns = stmt.query_map([], |r| r.get::<_, String>(1)).map_err(|e| e.to_string())?;
        columns.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?.contains(&"computer_id".to_string())
    } else { false };
    if legacy_exists && !has_computer_id {
        tx.execute_batch("ALTER TABLE launchers RENAME TO launchers_legacy;").map_err(|e| e.to_string())?;
    }
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS launchers (
            id INTEGER PRIMARY KEY,
            sync_id TEXT NOT NULL UNIQUE,
            computer_id TEXT NOT NULL REFERENCES computer_profiles(id),
            kind TEXT NOT NULL CHECK(kind IN ('project','app')),
            name TEXT NOT NULL,
            target TEXT NOT NULL,
            editor TEXT,
            last_opened_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            deleted_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_launchers_computer_kind ON launchers(computer_id,kind);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_launchers_active_target ON launchers(computer_id,kind,target) WHERE deleted_at IS NULL;"
    ).map_err(|e| e.to_string())?;
    if legacy_exists && !has_computer_id {
        let mut stmt = tx.prepare("SELECT id,kind,name,target,editor,last_opened_at FROM launchers_legacy").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, Option<String>>(4)?, r.get::<_, Option<i64>>(5)?)))
            .map_err(|e| e.to_string())?;
        let legacy = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        drop(stmt);
        for (id, kind, name, target, editor, last_opened_at) in legacy {
            let kind = if kind == "software" { "app" } else { "project" };
            tx.execute("INSERT INTO launchers(id,sync_id,computer_id,kind,name,target,editor,last_opened_at,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
                params![id, Uuid::new_v4().to_string(), current_id, kind, name, target, editor, last_opened_at, now_ms()])
                .map_err(|e| e.to_string())?;
        }
        tx.execute_batch("DROP TABLE launchers_legacy;").map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_todos(app: AppHandle) -> Result<Vec<Todo>, String> {
    let conn = db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id, text, completed, created_at FROM todos ORDER BY completed, created_at DESC, id DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Todo {
                id: r.get(0)?,
                text: r.get(1)?,
                completed: r.get::<_, i64>(2)? != 0,
                created_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn add_todo(app: AppHandle, text: String) -> Result<Todo, String> {
    let text = text.trim();
    if text.is_empty() || text.chars().count() > 200 {
        return Err("待办内容需要在 1～200 个字符之间".into());
    }
    let conn = db(&app)?;
    let created_at = now_ms();
    conn.execute("INSERT INTO todos(text, created_at) VALUES(?1, ?2)", params![text, created_at])
        .map_err(|e| e.to_string())?;
    Ok(Todo {
        id: conn.last_insert_rowid(),
        text: text.to_string(),
        completed: false,
        created_at,
    })
}

#[tauri::command]
fn set_todo_completed(app: AppHandle, id: i64, completed: bool) -> Result<(), String> {
    db(&app)?
        .execute("UPDATE todos SET completed=?1 WHERE id=?2", params![completed as i64, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_todo(app: AppHandle, id: i64) -> Result<(), String> {
    db(&app)?
        .execute("DELETE FROM todos WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_notes(app: AppHandle) -> Result<Vec<Note>, String> {
    let conn = db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id, content, created_at, updated_at FROM notes ORDER BY updated_at DESC, id DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Note {
                id: r.get(0)?,
                content: r.get(1)?,
                created_at: r.get(2)?,
                updated_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_note(app: AppHandle, id: Option<i64>, content: String) -> Result<Note, String> {
    let content = content.trim();
    if content.is_empty() || content.chars().count() > 2000 {
        return Err("速记内容需要在 1～2000 个字符之间".into());
    }
    let conn = db(&app)?;
    let updated_at = now_ms();
    let note_id = if let Some(id) = id {
        let changed = conn
            .execute(
                "UPDATE notes SET content=?1, updated_at=?2 WHERE id=?3",
                params![content, updated_at, id],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("速记不存在或已被删除".into());
        }
        id
    } else {
        conn.execute(
            "INSERT INTO notes(content, created_at, updated_at) VALUES(?1, ?2, ?2)",
            params![content, updated_at],
        )
        .map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };
    conn.query_row(
        "SELECT id, content, created_at, updated_at FROM notes WHERE id=?1",
        [note_id],
        |r| {
            Ok(Note {
                id: r.get(0)?,
                content: r.get(1)?,
                created_at: r.get(2)?,
                updated_at: r.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_note(app: AppHandle, id: i64) -> Result<(), String> {
    db(&app)?
        .execute("DELETE FROM notes WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn current_computer_id(conn: &Connection) -> Result<String, String> {
    conn.query_row("SELECT computer_id FROM local_binding WHERE singleton=1", [], |r| r.get(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_computers(app: AppHandle) -> Result<Vec<ComputerProfile>, String> {
    let conn = db(&app)?;
    let current_id = current_computer_id(&conn)?;
    let mut stmt = conn.prepare("SELECT id,name,platform FROM computer_profiles ORDER BY CASE WHEN id=?1 THEN 0 ELSE 1 END, created_at, name")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([&current_id], |r| {
        let id: String = r.get(0)?;
        Ok(ComputerProfile { is_current: id == current_id, id, name: r.get(1)?, platform: r.get(2)? })
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn add_computer(app: AppHandle, name: String, platform: String) -> Result<ComputerProfile, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 { return Err("电脑名称需要在 1～80 个字符之间".into()); }
    if !["windows", "macos", "linux"].contains(&platform.as_str()) { return Err("请选择电脑系统".into()); }
    let conn = db(&app)?;
    let id = Uuid::new_v4().to_string();
    conn.execute("INSERT INTO computer_profiles(id,name,platform,created_at,updated_at) VALUES(?1,?2,?3,?4,?4)",
        params![id, name, platform, now_ms()]).map_err(|e| e.to_string())?;
    Ok(ComputerProfile { id, name: name.into(), platform, is_current: false })
}

#[tauri::command]
fn rename_computer(app: AppHandle, id: String, name: String) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 { return Err("电脑名称需要在 1～80 个字符之间".into()); }
    let changed = db(&app)?.execute("UPDATE computer_profiles SET name=?1,updated_at=?2 WHERE id=?3", params![name, now_ms(), id])
        .map_err(|e| e.to_string())?;
    if changed == 0 { return Err("电脑档案不存在".into()); }
    Ok(())
}

#[tauri::command]
fn delete_computer(app: AppHandle, id: String) -> Result<(), String> {
    let mut conn = db(&app)?;
    if current_computer_id(&conn)? == id { return Err("不能删除当前电脑，请先在这台电脑上解绑".into()); }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM launchers WHERE computer_id=?1", [&id]).map_err(|e| e.to_string())?;
    let changed = tx.execute("DELETE FROM computer_profiles WHERE id=?1", [&id]).map_err(|e| e.to_string())?;
    if changed == 0 { return Err("电脑档案不存在".into()); }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_launchers(app: AppHandle, kind: String, computer_id: String) -> Result<Vec<Launcher>, String> {
    if kind != "project" && kind != "app" {
        return Err("未知的入口类型".into());
    }
    let conn = db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id, computer_id, kind, name, target, editor, last_opened_at FROM launchers WHERE kind=?1 AND computer_id=?2 AND deleted_at IS NULL ORDER BY last_opened_at DESC NULLS LAST, name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![kind, computer_id], |r| {
            Ok(Launcher {
                id: r.get(0)?,
                computer_id: r.get(1)?,
                kind: r.get(2)?,
                name: r.get(3)?,
                target: r.get(4)?,
                editor: r.get(5)?,
                last_opened_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_launcher(
    app: AppHandle,
    id: Option<i64>,
    computer_id: String,
    kind: String,
    name: String,
    target: String,
    editor: Option<String>,
) -> Result<(), String> {
    if kind != "project" && kind != "app" {
        return Err("未知的入口类型".into());
    }
    let name = name.trim();
    let target = target.trim();
    if name.is_empty() || target.is_empty() || name.chars().count() > 100 {
        return Err("请填写有效名称和路径".into());
    }
    let path = Path::new(target);
    if (kind == "project" && !path.is_dir()) || (kind == "app" && !path.is_file() && !path.is_dir()) {
        return Err("所选项目或软件地址不存在".into());
    }
    if kind == "project" {
        let editor_path = editor.as_deref().unwrap_or("");
        if editor_path.is_empty() || !Path::new(editor_path).exists() {
            return Err("请选择可用的编辑器".into());
        }
    }
    let conn = db(&app)?;
    if current_computer_id(&conn)? != computer_id { return Err("只能编辑当前电脑的入口".into()); }
    let result = if let Some(id) = id {
        conn.execute(
            "UPDATE launchers SET name=?1, target=?2, editor=?3,updated_at=?4 WHERE id=?5 AND kind=?6 AND computer_id=?7 AND deleted_at IS NULL",
            params![name, target, editor, now_ms(), id, kind, computer_id],
        )
    } else {
        conn.execute(
            "INSERT INTO launchers(sync_id,computer_id,kind,name,target,editor,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?7)",
            params![Uuid::new_v4().to_string(), computer_id, kind, name, target, editor, now_ms()],
        )
    };
    let changed = result.map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            "这个地址已经添加过了".to_string()
        } else {
            e.to_string()
        }
    })?;
    if changed == 0 { return Err("入口不存在或不属于当前电脑".into()); }
    Ok(())
}

#[tauri::command]
fn delete_launcher(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = db(&app)?;
    let current_id = current_computer_id(&conn)?;
    let changed = conn.execute("UPDATE launchers SET deleted_at=?1,updated_at=?1 WHERE id=?2 AND computer_id=?3 AND deleted_at IS NULL", params![now_ms(), id, current_id])
        .map_err(|e| e.to_string())?;
    if changed == 0 { return Err("入口不存在或不属于当前电脑".into()); }
    Ok(())
}

#[tauri::command]
fn launch_entry(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = db(&app)?;
    let (computer_id, kind, target, editor): (String, String, String, Option<String>) = conn
        .query_row(
            "SELECT computer_id,kind,target,editor FROM launchers WHERE id=?1 AND deleted_at IS NULL",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("入口不存在")?;
    if current_computer_id(&conn)? != computer_id { return Err("只能在所属电脑上打开此入口".into()); }
    if !Path::new(&target).exists() {
        return Err("地址已失效，请编辑后重试".into());
    }
    if kind == "project" {
        let editor = editor.ok_or("未设置编辑器")?;
        if !Path::new(&editor).exists() {
            return Err("编辑器地址已失效，请编辑后重试".into());
        }
        #[cfg(target_os = "macos")]
        let mut command = {
            let mut c = Command::new("open");
            c.arg("-a").arg(&editor).arg(&target);
            c
        };
        #[cfg(not(target_os = "macos"))]
        let mut command = {
            let mut c = Command::new(&editor);
            c.arg(&target);
            c
        };
        command.spawn().map_err(|e| format!("编辑器启动失败：{e}"))?;
    } else {
        #[cfg(target_os = "macos")]
        let mut command = {
            let mut c = Command::new("open");
            c.arg(&target);
            c
        };
        #[cfg(not(target_os = "macos"))]
        let mut command = Command::new(&target);
        command.spawn().map_err(|e| format!("应用启动失败：{e}"))?;
    }
    conn.execute("UPDATE launchers SET last_opened_at=?1 WHERE id=?2", params![now_ms(), id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_setting(app: AppHandle, key: String) -> Result<Option<String>, String> {
    db(&app)?
        .query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_setting(app: AppHandle, key: String, value: String) -> Result<(), String> {
    if !["capture_preferences", "mode", "page", "document_section", "workbench_section", "selected_computer_id", "pinned", "window_x", "window_y"].contains(&key.as_str()) {
        return Err("不支持的设置".into());
    }
    db(&app)?
        .execute(
            "INSERT INTO settings(key, value) VALUES(?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn quit_app(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || tools::stop_recording(&handle)).await.map_err(|e| e.to_string())??;
    app.exit(0);
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(tools::ToolState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示小助手", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::with_id("assistant").menu(&menu).show_menu_on_left_click(false).tooltip("桌面小助手");
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_tray_icon_event(|tray, event| {
                if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } | TrayIconEvent::DoubleClick { button: MouseButton::Left, .. }) {
                    show_from_tray(tray.app_handle());
                }
            }).on_menu_event(|app, event| match event.id.as_ref() {
                "show" => {
                    show_from_tray(app);
                }
                "stop-recording" => {
                    let _ = app.emit("tools-stop-recording", ());
                }
                "quit" => {
                    let _ = app.emit("tools-request-quit", ());
                }
                _ => {}
            })
            .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label().starts_with("capture-pin-") { return; }
                api.prevent_close();
                if window.label() == "capture" { capture_workspace::cancel_on_close(window.app_handle()); return; }
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_todos,
            add_todo,
            set_todo_completed,
            delete_todo,
            list_notes,
            save_note,
            delete_note,
            list_computers,
            add_computer,
            rename_computer,
            delete_computer,
            list_launchers,
            save_launcher,
            delete_launcher,
            launch_entry,
            get_setting,
            set_setting,
            set_tray_recording,
            restore_main_position,
            persist_main_position,
            tools::tool_displays,
            tools::native_capture_available,
            tools::capture_screenshot,
            tools::start_screen_recording,
            tools::stop_screen_recording,
            tools::screen_recording_status,
            tools::begin_tool_export,
            tools::append_tool_export,
            tools::finish_tool_export,
            tools::reveal_tool_output,
            tools::pause_screen_recording,
            capture_workspace::new_capture_draft,
            capture_workspace::read_capture_draft,
            capture_workspace::save_capture_draft,
            capture_workspace::delete_capture_draft,
            capture_workspace::list_capture_drafts,
            capture_workspace::open_capture_overlay,
            capture_workspace::close_capture_overlay,
            capture_workspace::capture_toolbar,
            capture_workspace::show_recording_border,
            capture_workspace::pin_capture,
            capture_workspace::close_pinned_capture,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("failed to run desktop assistant");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_legacy_launchers_into_current_computer_once() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE launchers (id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('project','software')), name TEXT NOT NULL, target TEXT NOT NULL, editor TEXT, last_opened_at INTEGER, UNIQUE(kind,target));
            INSERT INTO launchers(id,kind,name,target,editor,last_opened_at) VALUES(7,'project','旧项目','C:/old-project','C:/editor.exe',123);
            INSERT INTO launchers(id,kind,name,target,editor,last_opened_at) VALUES(8,'software','旧软件','C:/old-app.exe',NULL,456);").unwrap();
        initialize_schema(&mut conn).unwrap();
        initialize_schema(&mut conn).unwrap();
        let current = current_computer_id(&conn).unwrap();
        let rows: Vec<(i64, String, String, String, Option<String>, Option<i64>)> = {
            let mut stmt = conn.prepare("SELECT id,computer_id,kind,target,editor,last_opened_at FROM launchers ORDER BY id").unwrap();
            stmt.query_map([], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?)))
                .unwrap().collect::<Result<Vec<_>, _>>().unwrap()
        };
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0], (7, current.clone(), "project".into(), "C:/old-project".into(), Some("C:/editor.exe".into()), Some(123)));
        assert_eq!(rows[1], (8, current, "app".into(), "C:/old-app.exe".into(), None, Some(456)));
        conn.execute("UPDATE launchers SET deleted_at=1 WHERE id=8", []).unwrap();
        conn.execute("INSERT INTO launchers(sync_id,computer_id,kind,name,target,created_at,updated_at) VALUES(?1,?2,'app','新应用','C:/old-app.exe',2,2)",
            params![Uuid::new_v4().to_string(), rows[1].1]).unwrap();
    }
}
