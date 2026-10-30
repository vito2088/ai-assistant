use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::{fs, io::Write, path::{Path, PathBuf}, sync::Mutex};
use tauri::{AppHandle, Manager};

static LOCK: Mutex<()> = Mutex::new(());
const KEYS: &[&str] = &["ui_language", "pinned", "autostart", "feature_order", "feature_visibility", "capture_preferences", "capture_shortcuts", "ai_config_v2"];
pub fn is_file_setting(key: &str) -> bool { KEYS.contains(&key) }
fn path(conn: &Connection) -> Option<PathBuf> {
    conn.path().filter(|p| !p.is_empty()).map(|p| Path::new(p).with_file_name("settings.json"))
}
fn defaults() -> Value {
    json!({
        "ui_language": "zh-CN", "pinned": false, "autostart": null,
        "feature_order": {"groups":[],"children":{}},
        "feature_visibility": {"aiChat":true,"todo":true,"note":true,"project":true,"app":true,"terminalSessions":true,"calculator":true,"screenshot":true,"recording":true,"reminder":true},
        "capture_preferences": {"screenshotDirectory":"","recordingDirectory":"","countdown":3,"fps":30,"cursor":true,"autoOcr":false,"autoTranslate":false},
        "capture_shortcuts": {"screenshot":"Ctrl+Alt+KeyA","recording":"Ctrl+Alt+KeyR"},
        "ai_config_v2": {"profiles":[],"activeId":""}
    })
}
fn object<'a>(value: &'a Value, field: &str, keys: &[&str]) -> Result<&'a Map<String, Value>, String> {
    let obj = value.as_object().ok_or_else(|| format!("{field}：必须是 JSON 对象"))?;
    for key in obj.keys() { if !keys.contains(&key.as_str()) { return Err(format!("{field}.{key}：不支持的配置项")); } }
    for key in keys { if !obj.contains_key(*key) { return Err(format!("{field}.{key}：缺少必填配置项")); } }
    Ok(obj)
}
fn check(ok: bool, field: &str, reason: &str) -> Result<(), String> {
    if ok { Ok(()) } else { Err(format!("{field}：{reason}")) }
}
pub fn validate(value: &Value) -> Result<(), String> {
    let mut normalized=value.clone();
    if normalized.get("feature_order").is_none() { normalized["feature_order"]=json!({"groups":[],"children":{}}); }
    object(&normalized, "settings", KEYS)?;
    let order=&normalized["feature_order"];
    object(order,"feature_order",&["groups","children"])?;
    let groups=["ai","document","workbench","terminal","tools"];
    let valid_list=|list:&Value,known:&[&str]| -> bool {
        list.as_array().is_some_and(|items| items.iter().all(|id| id.as_str().is_some_and(|s|known.contains(&s))) && items.iter().filter_map(Value::as_str).collect::<std::collections::HashSet<_>>().len()==items.len())
    };
    check(valid_list(&order["groups"],&groups),"feature_order.groups","必须是无重复的栏目列表")?;
    let children=order["children"].as_object().ok_or("feature_order.children：必须是 JSON 对象")?;
    for (group,items) in children {
        let ids:&[&str]=match group.as_str() { "ai"=>&["aiChat"],"document"=>&["todo","note"],"workbench"=>&["project","app"],"terminal"=>&["terminalSessions"],"tools"=>&["screenshot","recording","calculator","reminder"],_=>return Err("feature_order.children：未知栏目".into()) };
        check(valid_list(items,ids),&format!("feature_order.children.{group}"),"必须是所属栏目内无重复的功能列表")?;
    }
    check(matches!(value["ui_language"].as_str(), Some("zh-CN" | "en" | "es")), "ui_language", "仅支持 zh-CN、en、es")?;
    check(value["pinned"].is_boolean(), "pinned", "必须是布尔值")?;
    check(value["autostart"].is_boolean() || value["autostart"].is_null(), "autostart", "必须是布尔值或 null（保留系统设置）")?;
    let visibility=value["feature_visibility"].as_object().ok_or("feature_visibility：必须是 JSON 对象")?;
    let mut legacy_visibility=value["feature_visibility"].clone();
    if let Some(fields)=legacy_visibility.as_object_mut() { fields.remove("timer");fields.remove("reminder");fields.remove("terminalSessions"); }
    object(&legacy_visibility,"feature_visibility",&["aiChat","todo","note","project","app","calculator","screenshot","recording"])?;
    for (key, entry) in visibility { check(entry.is_boolean(), &format!("feature_visibility.{key}"), "必须是布尔值")?; }
    let p = &value["capture_preferences"];
    // Older settings remain valid; missing switches mean manual recognition/translation.
    let mut legacy_preferences = p.clone();
    if let Some(fields) = legacy_preferences.as_object_mut() { fields.remove("autoOcr"); fields.remove("autoTranslate"); }
    object(&legacy_preferences, "capture_preferences", &["screenshotDirectory","recordingDirectory","countdown","fps","cursor"])?;
    for key in ["autoOcr", "autoTranslate"] {
        if let Some(auto) = p.get(key) { check(auto.is_boolean(), &format!("capture_preferences.{key}"), "必须是布尔值")?; }
    }
    for key in ["screenshotDirectory", "recordingDirectory"] {
        check(p[key].as_str().is_some_and(|s| s.is_empty() || (!s.contains('\0') && Path::new(s).is_absolute())), &format!("capture_preferences.{key}"), "必须是绝对文件夹路径或空字符串")?;
    }
    check(p["countdown"].as_u64().is_some_and(|n| n <= 10), "capture_preferences.countdown", "必须是 0～10 的整数")?;
    check(p["fps"].as_u64().is_some_and(|n| (15..=60).contains(&n)), "capture_preferences.fps", "必须是 15～60 的整数")?;
    check(p["cursor"].is_boolean(), "capture_preferences.cursor", "必须是布尔值")?;
    let shortcuts = &value["capture_shortcuts"];
    object(shortcuts, "capture_shortcuts", &["screenshot","recording"])?;
    for key in ["screenshot", "recording"] {
        let keypath = format!("capture_shortcuts.{key}");
        let text = shortcuts[key].as_str().ok_or_else(|| format!("{keypath}：必须是字符串"))?;
        if !text.is_empty() {
            let parts = text.split('+').collect::<Vec<_>>();
            let mut order = 0;
            for modifier in &parts[..parts.len() - 1] {
                let next = match *modifier { "Ctrl" => 1, "Alt" => 2, "Shift" => 3, "Super" => 4, _ => 0 };
                check(next > order, &keypath, "修饰键应按 Ctrl、Alt、Shift、Super 顺序排列，且不能重复")?;
                order = next;
            }
            let code = parts[parts.len() - 1];
            let supported = (code.len() == 4 && code.starts_with("Key") && code.as_bytes()[3].is_ascii_uppercase())
                || (code.len() == 6 && code.starts_with("Digit") && code.as_bytes()[5].is_ascii_digit())
                || code.strip_prefix('F').and_then(|n| n.parse::<u8>().ok()).is_some_and(|n| (1..=24).contains(&n) && code == format!("F{n}"))
                || ["Space","Enter","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End","PageUp","PageDown","Insert","Delete","Backspace"].contains(&code);
            check(supported, &keypath, "不支持的按键名称，请使用 KeyA、Digit1、F1 等格式")?;
            check(text.split('+').any(|p| matches!(p, "Ctrl" | "Alt" | "Super")), &keypath, "必须包含 Ctrl、Alt 或 Super")?;
            text.parse::<tauri_plugin_global_shortcut::Shortcut>().map_err(|e| format!("{keypath}：{e}"))?;
        }
    }
    check(shortcuts["screenshot"] == "" || shortcuts["screenshot"] != shortcuts["recording"], "capture_shortcuts", "截图与录屏快捷键不能相同")?;
    super::ai::validate_catalog_json(&value["ai_config_v2"])
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let mut conn = Connection::open(dir.path().join("assistant.db")).unwrap();
        crate::initialize_schema(&mut conn).unwrap();
        (dir, conn)
    }
    #[test]
    fn feature_order_is_optional_for_old_files_and_validated_for_new_files() {
        let mut value=defaults();
        value.as_object_mut().unwrap().remove("feature_order");
        validate(&value).unwrap();
        assert!(parse(&value.to_string()).unwrap()["feature_order"].is_object());
        value["feature_order"]=json!({"groups":["tools","ai"],"children":{"tools":["reminder","calculator"]}});
        validate(&value).unwrap();
        value["feature_order"]["children"]["tools"]=json!(["note"]);
        assert!(validate(&value).is_err());
        value["feature_order"]=json!({"groups":["tools","tools"],"children":{}});
        assert!(validate(&value).is_err());
    }
    #[test]
    fn terminal_visibility_and_order_accept_both_old_and_new_settings(){
        let mut value=defaults();value["feature_order"]=json!({"groups":["terminal","ai"],"children":{"terminal":["terminalSessions"]}});value["feature_visibility"]["terminalSessions"]=json!(false);validate(&value).unwrap();value["feature_visibility"].as_object_mut().unwrap().remove("terminalSessions");validate(&value).unwrap();value["feature_visibility"]["terminalSessions"]=json!("false");assert!(validate(&value).is_err());
    }
    #[test]
    fn migrates_settings_to_typed_json_and_keeps_business_data_in_database() {
        let (dir, conn) = fixture();
        conn.execute("INSERT INTO settings(key,value) VALUES('ui_language','en'),('pinned','true')", []).unwrap();
        conn.execute("INSERT INTO notes(content,created_at,updated_at) VALUES('keep me',1,1)", []).unwrap();
        assert_eq!(read(&conn, "ui_language").unwrap().as_deref(), Some("en"));
        let file = dir.path().join("settings.json");
        let content = fs::read_to_string(&file).unwrap();
        let value = parse(&content).unwrap();
        assert_eq!(value["pinned"], true);
        assert!(value["capture_preferences"].is_object());
        assert!(dir.path().join("settings.default.json").is_file());
        store(&conn, "ui_language", "es").unwrap();
        let db_value: String = conn.query_row("SELECT value FROM settings WHERE key='ui_language'", [], |r| r.get(0)).unwrap();
        assert_eq!(db_value, "en"); // SQLite is only the migration source now.
        assert_eq!(read(&conn, "ui_language").unwrap().as_deref(), Some("es"));
        let note: String = conn.query_row("SELECT content FROM notes", [], |r| r.get(0)).unwrap();
        assert_eq!(note, "keep me");
    }
    #[test]
    fn external_invalid_json_uses_defaults_without_overwriting_and_recovers_after_repair() {
        let (dir, conn) = fixture();
        store(&conn, "ui_language", "en").unwrap();
        let file = dir.path().join("settings.json");
        let good = fs::read_to_string(&file).unwrap();
        for bad in ["{\n bad json".to_string(), good.replace("\"en\"", "123")] {
            fs::write(&file, &bad).unwrap();
            assert_eq!(read(&conn, "ui_language").unwrap().as_deref(), Some("zh-CN"));
            assert!(parse(&bad).is_err());
            assert!(store(&conn, "pinned", "true").is_err());
            assert_eq!(fs::read_to_string(&file).unwrap(), bad);
        }
        fs::write(&file, good.replace("\"en\"", "\"es\"")).unwrap();
        assert_eq!(read(&conn, "ui_language").unwrap().as_deref(), Some("es"));
    }
    #[test]
    fn invalid_editor_saves_and_stale_edits_leave_original_file_intact() {
        let (dir, conn) = fixture();
        read(&conn, "ui_language").unwrap();
        let file = dir.path().join("settings.json");
        let initial = fs::read_to_string(&file).unwrap();
        assert!(save_document(&file, "{\n invalid", &initial).unwrap_err().contains("第 2 行"));
        assert_eq!(fs::read_to_string(&file).unwrap(), initial);
        store(&conn, "pinned", "true").unwrap();
        let current = fs::read_to_string(&file).unwrap();
        assert!(save_document(&file, &initial, &initial).unwrap_err().contains("已被其他操作修改"));
        assert_eq!(fs::read_to_string(&file).unwrap(), current);
    }
    #[test]
    fn validates_field_types_ranges_unknown_fields_and_model_references() {
        for (pointer, bad, field) in [
            ("/pinned", json!("true"), "pinned"),
            ("/capture_preferences/fps", json!(100), "fps"),
            ("/capture_preferences/countdown", json!(-1), "countdown"),
            ("/feature_visibility/aiChat", json!(0), "aiChat"),
            ("/capture_shortcuts/screenshot", json!("Ctrl+A"), "screenshot"),
            ("/capture_shortcuts/screenshot", json!("Alt+Ctrl+KeyA"), "screenshot"),
            ("/ai_config_v2/activeId", json!("missing"), "activeId"),
        ] {
            let mut value = defaults(); *value.pointer_mut(pointer).unwrap() = bad;
            assert!(validate(&value).unwrap_err().contains(field));
        }
        let mut value = defaults(); value["typo"] = json!(true);
        assert!(validate(&value).unwrap_err().contains("typo"));
        let mut value = defaults(); value["ai_config_v2"] = json!({"activeId":"one","profiles":[{"id":"one","name":"Model","provider":"custom","baseUrl":"https://example.org/v1","model":"test","vision":false,"language":"中文"}]});
        validate(&value).unwrap();
        value["ai_config_v2"]["profiles"][0]["apiKey"] = json!("must-not-be-stored");
        assert!(validate(&value).unwrap_err().contains("apiKey"));
    }
    #[test]
    fn optional_capture_switches_preserve_older_settings_and_round_trip() {
        let (dir, conn) = fixture();
        read(&conn, "ui_language").unwrap();
        let file = dir.path().join("settings.json");
        let mut value = defaults();
        value["ui_language"] = json!("es");
        value["capture_preferences"].as_object_mut().unwrap().remove("autoOcr");
        value["capture_preferences"].as_object_mut().unwrap().remove("autoTranslate");
        fs::write(&file, pretty(&value).unwrap()).unwrap();
        assert_eq!(read(&conn, "ui_language").unwrap().as_deref(), Some("es"));
        validate(&value).unwrap();
        value["capture_preferences"]["autoOcr"] = json!(true);
        value["capture_preferences"]["autoTranslate"] = json!(true);
        store(&conn, "capture_preferences", &value["capture_preferences"].to_string()).unwrap();
        let loaded: Value = serde_json::from_str(&read(&conn, "capture_preferences").unwrap().unwrap()).unwrap();
        assert_eq!(loaded["autoOcr"], true);
        assert_eq!(loaded["autoTranslate"], true);
        for key in ["autoOcr", "autoTranslate"] {
            let mut invalid = value.clone(); invalid["capture_preferences"][key] = json!("true");
            assert!(validate(&invalid).unwrap_err().contains(key));
        }
    }
    #[test]
    fn serializes_independent_updates_without_losing_settings() {
        let (dir, conn) = fixture(); read(&conn, "ui_language").unwrap();
        let db = dir.path().join("assistant.db");
        std::thread::scope(|scope| {
            for (key, value) in [("ui_language", "es"), ("pinned", "true")] {
                let db = db.clone(); scope.spawn(move || { store(&Connection::open(db).unwrap(), key, value).unwrap(); });
            }
        });
        assert_eq!(read(&conn, "ui_language").unwrap().as_deref(), Some("es"));
        assert_eq!(read(&conn, "pinned").unwrap().as_deref(), Some("true"));
    }
}
fn parse(content: &str) -> Result<Value, String> {
    let mut value: Value = serde_json::from_str(content.trim_start_matches('\u{feff}')).map_err(|e| format!("settings.json 第 {} 行，第 {} 列：{}", e.line(), e.column(), e))?;
    if value.is_object() && value.get("feature_order").is_none() { value["feature_order"]=json!({"groups":[],"children":{}}); }
    validate(&value)?;
    Ok(value)
}
fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("设置目录不存在")?).map_err(|e| e.to_string())?;
    temp.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| format!("无法保存 settings.json：{}", e.error))?;
    Ok(())
}
fn pretty(value: &Value) -> Result<String, String> { serde_json::to_string_pretty(value).map(|s| s + "\n").map_err(|e| e.to_string()) }
fn ensure(conn: &Connection, path: &Path) -> Result<(), String> {
    let reference = path.with_file_name("settings.default.json");
    let default_content = pretty(&defaults())?;
    if fs::read_to_string(&reference).ok().as_deref() != Some(default_content.as_str()) { atomic_write(&reference, &default_content)?; }
    if path.exists() { return Ok(()); }
    let mut value = defaults();
    for key in KEYS {
        let saved: Option<String> = conn.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
        if let Some(raw) = saved {
            let parsed = if *key == "ui_language" { Value::String(raw) } else { serde_json::from_str(&raw).unwrap_or(Value::String(raw)) };
            if let (Some(base), Some(extra)) = (value[key].as_object_mut(), parsed.as_object()) { base.extend(extra.clone()); }
            else { value[key] = parsed; }
        } else if *key == "ai_config_v2" {
            let legacy: Option<String> = conn.query_row("SELECT value FROM settings WHERE key='ai_config'", [], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
            value[key] = match super::ai::migrate(legacy.as_deref()) {
                Ok(catalog) => serde_json::to_value(catalog).map_err(|e| e.to_string())?,
                Err(_) => Value::String(legacy.unwrap_or_default()),
            };
        }
    }
    atomic_write(path, &pretty(&value)?)
}
pub fn read(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    if let Some(path) = path(conn).filter(|_| is_file_setting(key)) {
        let _guard = LOCK.lock().map_err(|_| "设置文件暂时不可用")?;
        ensure(conn, &path)?;
        let value = fs::read_to_string(path).map_err(|e| e.to_string()).and_then(|text| parse(&text)).unwrap_or_else(|_| defaults());
        return Ok(match &value[key] { Value::Null => None, Value::String(s) => Some(s.clone()), other => Some(other.to_string()) });
    }
    conn.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0)).optional().map_err(|e| e.to_string())
}
pub fn store(conn: &Connection, key: &str, raw: &str) -> Result<(), String> {
    if let Some(path) = path(conn).filter(|_| is_file_setting(key)) {
        let _guard = LOCK.lock().map_err(|_| "设置文件暂时不可用")?;
        ensure(conn, &path)?;
        let mut value = parse(&fs::read_to_string(&path).map_err(|e| e.to_string())?)?;
        value[key] = if key == "ui_language" { Value::String(raw.to_owned()) } else { serde_json::from_str(raw).map_err(|e| format!("{key}：{e}"))? };
        validate(&value)?;
        return atomic_write(&path, &pretty(&value)?);
    }
    conn.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", rusqlite::params![key,raw]).map_err(|e| e.to_string())?;
    Ok(())
}
pub fn validate_current(conn: &Connection) -> Result<(), String> {
    if let Some(path) = path(conn) {
        let _guard = LOCK.lock().map_err(|_| "设置文件暂时不可用")?;
        ensure(conn, &path)?;
        parse(&fs::read_to_string(path).map_err(|e| e.to_string())?)?;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct Document { path: String, content: String, defaults: String, error: Option<String> }
#[tauri::command]
pub fn read_settings_file(app: AppHandle) -> Result<Document, String> {
    let conn = super::db(&app)?;
    let path = path(&conn).ok_or("设置文件路径不可用")?;
    let _guard = LOCK.lock().map_err(|_| "设置文件暂时不可用")?;
    ensure(&conn, &path)?;
    // Return malformed external edits as text so the built-in editor can repair them.
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let error = parse(&content).err();
    Ok(Document { path: path.to_string_lossy().into(), content, defaults: pretty(&defaults())?, error })
}
#[tauri::command]
pub fn validate_settings_json(content: String) -> Result<(), String> { parse(&content).map(|_| ()) }
fn save_document(path: &Path, content: &str, expected: &str) -> Result<String, String> {
    let value = parse(content)?;
    let _guard = LOCK.lock().map_err(|_| "设置文件暂时不可用")?;
    let current = fs::read_to_string(path).map_err(|e| e.to_string())?;
    if current != expected { return Err("settings.json 已被其他操作修改，请重新打开后合并修改".into()); }
    let formatted = pretty(&value)?;
    atomic_write(path, &formatted)?;
    Ok(formatted)
}
#[tauri::command]
pub fn save_settings_json(app: AppHandle, content: String, expected: String) -> Result<String, String> {
    let conn = super::db(&app)?;
    save_document(&path(&conn).ok_or("设置文件路径不可用")?, &content, &expected)
}
#[tauri::command]
pub fn reveal_settings_file(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    { std::process::Command::new("explorer.exe").arg("/select,").arg(dir.join("settings.json")).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg("-R").arg(dir.join("settings.json")).spawn().map_err(|e| e.to_string())?; }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    { std::process::Command::new("xdg-open").arg(dir).spawn().map_err(|e| e.to_string())?; }
    Ok(())
}
#[tauri::command]
pub fn open_settings_external(app: AppHandle) -> Result<(), String> {
    let document = read_settings_file(app)?;
    #[cfg(windows)]
    let mut command = std::process::Command::new("notepad.exe");
    #[cfg(target_os = "macos")]
    let mut command = { let mut c = std::process::Command::new("open"); c.arg("-t"); c };
    #[cfg(all(not(windows), not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command.arg(document.path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
