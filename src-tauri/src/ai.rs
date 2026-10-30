//! Optional AI transport. Credentials never enter SQLite or model responses.
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::Duration,
};
use tauri::{ipc::Channel, AppHandle};
#[path = "ai_connection.rs"]
pub(crate) mod connection;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelMapping {
    name: String,
    model: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    provider: String,
    base_url: String,
    model: String,
    vision: bool,
    language: String,
    #[serde(default)]
    has_key: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    model_mappings: Vec<ModelMapping>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            provider: "custom".into(),
            base_url: String::new(),
            model: String::new(),
            vision: false,
            language: "中文".into(),
            has_key: false,
            model_mappings: Vec::new(),
        }
    }
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Catalog {
    profiles: Vec<Settings>,
    active_id: String,
}
static CONFIG_LOCK: Mutex<()> = Mutex::new(());
fn account(settings: &Settings) -> String {
    if settings.id == "legacy" {
        settings.base_url.clone()
    } else {
        format!("profile:{}:{}", settings.id, settings.base_url)
    }
}
fn read_catalog(app: &AppHandle) -> Result<Catalog, String> {
    if let Some(raw) = super::get_setting(app.clone(), "ai_config_v2".into())? {
        return serde_json::from_str(&raw).map_err(|_| "AI 配置损坏".into());
    }
    let raw = super::get_setting(app.clone(), "ai_config".into())?;
    migrate(raw.as_deref())
}
pub(super) fn migrate(raw: Option<&str>) -> Result<Catalog, String> {
    let Some(raw) = raw else {
        return Ok(Catalog::default());
    };
    let mut old: Settings = serde_json::from_str(raw).map_err(|_| "AI 配置损坏")?;
    if old.model.is_empty() {
        return Ok(Catalog::default());
    }
    old.id = "legacy".into();
    old.name = old.model.clone();
    old.provider = "custom".into();
    old.has_key = false;
    Ok(Catalog {
        profiles: vec![old],
        active_id: "legacy".into(),
    })
}
fn write_catalog(app: &AppHandle, catalog: &Catalog) -> Result<(), String> {
    let conn = super::db(app).map_err(|_| "本机数据库：无法打开模型配置存储，请检查目录权限")?;
    persist_catalog(&conn, catalog)
}
fn persist_catalog(conn: &rusqlite::Connection, catalog: &Catalog) -> Result<(), String> {
    let mut stored = catalog.clone();
    for p in &mut stored.profiles {
        p.has_key = false;
    }
    let data = serde_json::to_string(&stored).map_err(|_| "模型配置：无法编码保存数据")?;
    super::store_setting(conn, "ai_config_v2", &data)
        .map_err(|error| format!("模型配置写入失败：{error}"))
}
pub(super) fn validate_catalog_json(value: &Value) -> Result<(), String> {
    let mut catalog: Catalog =
        serde_json::from_value(value.clone()).map_err(|e| format!("ai_config_v2：{e}"))?;
    if catalog.profiles.len() > 50 {
        return Err("ai_config_v2.profiles：最多保存 50 个模型配置".into());
    }
    let mut ids = std::collections::HashSet::new();
    for (index, profile) in catalog.profiles.iter_mut().enumerate() {
        let field = format!("ai_config_v2.profiles[{index}]");
        if profile.id.is_empty()
            || profile.id.len() > 80
            || !profile
                .id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-')
            || !ids.insert(profile.id.clone())
        {
            return Err(format!(
                "{field}.id：必须是唯一的字母、数字或短横线编号（1～80 字符）"
            ));
        }
        validate_settings(profile).map_err(|e| format!("{field}.{e}"))?;
    }
    if (!catalog.profiles.is_empty() && !ids.contains(&catalog.active_id))
        || (catalog.profiles.is_empty() && !catalog.active_id.is_empty())
    {
        return Err("ai_config_v2.activeId：必须指向已有模型；没有模型时应为空字符串".into());
    }
    Ok(())
}
fn with_key_status(mut catalog: Catalog) -> Result<Catalog, String> {
    for p in &mut catalog.profiles {
        p.has_key = !secret(&account(p))?.is_empty();
    }
    Ok(catalog)
}
fn select_profile<'a>(catalog: &'a Catalog, id: &str) -> Result<&'a Settings, String> {
    catalog
        .profiles
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "模型配置不存在，请重新选择".into())
}
fn execution_profile<'a>(catalog: &'a Catalog, id: &str) -> Result<&'a Settings, String> {
    let id = if id.is_empty() { catalog.active_id.as_str() } else { id };
    if id.is_empty() { return Err("请先在设置中配置并选择主 AI".into()); }
    select_profile(catalog, id)
}

#[cfg(test)]
mod terminal_binding_tests {
    use super::*;
    #[test]
    fn primary_terminal_ai_follows_selection_and_explicit_contacts_keep_their_model() {
        let mut catalog = Catalog {
            profiles: vec![Settings { id: "one".into(), ..Default::default() }, Settings { id: "two".into(), ..Default::default() }],
            active_id: "one".into(),
        };
        assert_eq!(execution_profile(&catalog, "").unwrap().id, "one");
        catalog.active_id = "two".into();
        assert_eq!(execution_profile(&catalog, "").unwrap().id, "two");
        assert_eq!(execution_profile(&catalog, "one").unwrap().id, "one");
        assert!(execution_profile(&catalog, "deleted").is_err());
        catalog.active_id.clear();
        assert!(execution_profile(&catalog, "").is_err());
    }
}

#[cfg(test)]
mod profile_tests {
    use super::*;
    #[test]
    fn model_catalog_saves_through_internal_storage_and_survives_selection_and_deletion() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        super::super::initialize_schema(&mut conn).unwrap();
        assert!(super::super::validate_public_setting("ai_config_v2", "{}").is_err());
        assert!(super::super::validate_public_setting("ui_language", "en").is_ok());
        let mut catalog = Catalog {
            profiles: vec![
                Settings {
                    id: "one".into(),
                    name: "First".into(),
                    model: "model-a".into(),
                    has_key: true,
                    ..Settings::default()
                },
                Settings {
                    id: "two".into(),
                    name: "Second".into(),
                    model: "model-b".into(),
                    ..Settings::default()
                },
            ],
            active_id: "one".into(),
        };
        let reload = || -> Catalog {
            let raw: String = conn
                .query_row(
                    "SELECT value FROM settings WHERE key='ai_config_v2'",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            serde_json::from_str(&raw).unwrap()
        };
        persist_catalog(&conn, &catalog).unwrap();
        assert_eq!(reload().profiles.len(), 2);
        assert!(!reload().profiles[0].has_key);
        catalog.active_id = "two".into();
        persist_catalog(&conn, &catalog).unwrap();
        let restored = reload();
        assert_eq!(
            select_profile(&restored, &restored.active_id)
                .unwrap()
                .model,
            "model-b"
        );
        catalog.profiles.clear();
        catalog.active_id.clear();
        persist_catalog(&conn, &catalog).unwrap();
        assert!(reload().profiles.is_empty());
        assert!(reload().active_id.is_empty());
        conn.execute_batch("PRAGMA query_only=ON").unwrap();
        assert!(persist_catalog(&conn, &catalog)
            .unwrap_err()
            .contains("模型配置写入失败"));
    }
    #[test]
    fn invalid_model_fields_are_identified_before_credentials_or_storage_change() {
        let valid = Settings {
            name: "Model".into(),
            model: "model-id".into(),
            base_url: "https://example.org/v1".into(),
            ..Settings::default()
        };
        for (mut profile, field) in [
            (
                Settings {
                    name: " ".into(),
                    ..valid.clone()
                },
                "配置名称：",
            ),
            (
                Settings {
                    base_url: "bad-url".into(),
                    ..valid.clone()
                },
                "服务地址：",
            ),
            (
                Settings {
                    model: " ".into(),
                    ..valid.clone()
                },
                "模型 ID：",
            ),
            (
                Settings {
                    language: " ".into(),
                    ..valid.clone()
                },
                "默认翻译语言：",
            ),
        ] {
            assert!(validate_settings(&mut profile)
                .unwrap_err()
                .starts_with(field));
        }
        assert!(validate_settings(&mut valid.clone()).is_ok());
    }
    #[test]
    fn migration_preserves_model_and_legacy_credential_account() {
        let raw = r#"{"baseUrl":"https://example.org/v1","model":"old-model","vision":true,"language":"中文","hasKey":true}"#;
        let catalog = migrate(Some(raw)).unwrap();
        let profile = select_profile(&catalog, &catalog.active_id).unwrap();
        assert_eq!(profile.id, "legacy");
        assert_eq!(profile.model, "old-model");
        assert_eq!(profile.name, "old-model");
        assert!(profile.vision);
        assert!(!profile.has_key);
        assert_eq!(account(profile), "https://example.org/v1");
        assert!(select_profile(&catalog, "unknown").is_err());
        assert!(migrate(Some("broken")).is_err());
        assert!(migrate(None).unwrap().profiles.is_empty());
    }
    #[test]
    fn credentials_are_isolated_by_profile_and_endpoint() {
        let first = Settings {
            id: "one".into(),
            base_url: "https://example.org/v1".into(),
            ..Settings::default()
        };
        let second = Settings {
            id: "two".into(),
            ..first.clone()
        };
        let changed = Settings {
            base_url: "https://other.example.org/v1".into(),
            ..first.clone()
        };
        assert_ne!(account(&first), account(&second));
        assert_ne!(account(&first), account(&changed));
        let empty: Catalog = serde_json::from_str(r#"{"profiles":[],"activeId":""}"#).unwrap();
        assert!(select_profile(&empty, "legacy").is_err());
    }
}
fn entry(base: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.myassistant.desktop.ai", base).map_err(|_| "系统凭据库不可用".into())
}
fn secret(base: &str) -> Result<String, String> {
    match entry(base)?.get_password() {
        Ok(s) => Ok(s),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(_) => Err("无法读取系统凭据库，请解锁系统密钥环后重试".into()),
    }
}
fn endpoint(base: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(base.trim()).map_err(|_| "请输入有效的模型服务地址")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if matches!(url.host_str(), Some("open.bigmodel.cn" | "api.z.ai"))
        && (url.path().starts_with("/api/anthropic") || url.path().starts_with("/api/v1"))
    {
        return Err("智谱的 Anthropic/Responses 地址不能用于 Chat Completions；Coding Plan 请使用 https://open.bigmodel.cn/api/coding/paas/v4。".into());
    }
    if url.scheme() != "https" && !(url.scheme() == "http" && local) {
        return Err("云端服务需使用 HTTPS；本机服务可使用 HTTP".into());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("服务地址不能包含账号、查询参数或片段".into());
    }
    let base = base.trim().trim_end_matches('/');
    Ok(if base.ends_with("/chat/completions") {
        base.into()
    } else {
        format!("{base}/chat/completions")
    })
}
fn validate_settings(settings: &mut Settings) -> Result<(), String> {
    settings.name = settings.name.trim().to_owned();
    if settings.name.is_empty() || settings.name.chars().count() > 80 {
        return Err("配置名称：请输入 1～80 个字符".into());
    }
    settings.base_url = settings.base_url.trim().trim_end_matches('/').to_owned();
    endpoint(&settings.base_url).map_err(|reason| format!("服务地址：{reason}"))?;
    settings.model = settings.model.trim().to_owned();
    if settings.model.is_empty() || settings.model.chars().count() > 200 {
        return Err("模型 ID：请输入 1～200 个字符".into());
    }
    if settings.model_mappings.len() > 50 {
        return Err("模型映射最多添加 50 条".into());
    }
    let mut names = std::collections::HashSet::new();
    let mut models = std::collections::HashSet::new();
    for mapping in &mut settings.model_mappings {
        mapping.name = mapping.name.trim().into();
        mapping.model = mapping.model.trim().into();
        if mapping.name.is_empty()
            || mapping.name.chars().count() > 80
            || !names.insert(mapping.name.clone())
        {
            return Err("模型映射名称须为 1～80 字符且不能重复".into());
        }
        if mapping.model.is_empty()
            || mapping.model.chars().count() > 200
            || mapping.model.chars().any(char::is_control)
            || !models.insert(mapping.model.clone())
        {
            return Err("实际模型须为 1～200 字符且不能重复或包含控制字符".into());
        }
    }
    if !settings.model_mappings.is_empty() && !models.contains(&settings.model) {
        return Err("请在模型映射中选中一个模型".into());
    }
    settings.language = settings.language.trim().to_owned();
    if settings.language.is_empty() || settings.language.chars().count() > 30 {
        return Err("默认翻译语言：请输入 1～30 个字符".into());
    }
    Ok(())
}
#[tauri::command]
pub fn ai_settings(app: AppHandle) -> Result<Catalog, String> {
    let _guard = CONFIG_LOCK.lock().map_err(|_| "AI 配置暂时不可用")?;
    with_key_status(read_catalog(&app)?)
}
fn models_endpoint(base: &str) -> Result<String, String> {
    let chat = endpoint(base)?;
    Ok(format!(
        "{}/models",
        chat.trim_end_matches("/chat/completions")
    ))
}
fn parse_models(value: Value) -> Result<Vec<String>, String> {
    let rows = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or("模型列表格式不兼容，请手动添加模型映射")?;
    let mut ids = std::collections::BTreeSet::new();
    for row in rows {
        if let Some(id) = row.get("id").and_then(Value::as_str).map(str::trim) {
            if !id.is_empty() && id.chars().count() <= 200 && !id.chars().any(char::is_control) {
                ids.insert(id.to_owned());
            }
        }
    }
    Ok(ids.into_iter().collect())
}
async fn fetch_models(base: &str, key: &str) -> Result<Vec<String>, String> {
    let url = models_endpoint(base)?;
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none());
    if matches!(
        reqwest::Url::parse(&url)
            .ok()
            .and_then(|u| u.host_str().map(str::to_owned))
            .as_deref(),
        Some("localhost" | "127.0.0.1" | "[::1]")
    ) {
        builder = builder.no_proxy();
    }
    let client = builder.build().map_err(|_| "无法初始化网络连接")?;
    let mut request = client.get(url);
    if !key.is_empty() {
        request = request.bearer_auth(key);
    }
    let mut response = request
        .send()
        .await
        .map_err(|_| "连接失败或超时，请检查服务地址和网络")?;
    match response.status().as_u16() {
        200..=299 => (),
        401 | 403 => return Err("获取模型列表认证失败，请检查 API 密钥和访问权限".into()),
        404 | 405 => return Err("该服务不支持模型列表接口，请手动添加模型映射".into()),
        _ => return Err("获取模型列表失败，请检查服务状态或稍后重试".into()),
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "接收中断，请重试")? {
        if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
            return Err("模型列表过大，请手动添加模型映射".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    parse_models(
        serde_json::from_slice(&bytes).map_err(|_| "模型列表格式不兼容，请手动添加模型映射")?,
    )
}
#[tauri::command]
pub async fn ai_list_models(
    app: AppHandle,
    profile_id: String,
    base_url: String,
    api_key: Option<String>,
) -> Result<Vec<String>, String> {
    models_endpoint(&base_url)?;
    let base = base_url.trim().trim_end_matches('/').to_owned();
    let lookup_base = base.clone();
    let key = tauri::async_runtime::spawn_blocking(move || {
        if let Some(key) = api_key.filter(|k| !k.trim().is_empty()) {
            return Ok(key.trim().to_owned());
        }
        let _guard = CONFIG_LOCK.lock().map_err(|_| "AI 配置暂时不可用")?;
        let catalog = read_catalog(&app)?;
        // Never reuse a stored credential after changing the service address.
        match catalog
            .profiles
            .iter()
            .find(|p| p.id == profile_id && p.base_url == lookup_base)
        {
            Some(profile) => secret(&account(profile)),
            None => Ok(String::new()),
        }
    })
    .await
    .map_err(|_| "无法读取系统凭据库")??;
    fetch_models(&base, &key).await
}
#[tauri::command]
pub fn ai_save_settings(
    app: AppHandle,
    mut settings: Settings,
    api_key: Option<String>,
    clear_key: bool,
) -> Result<Catalog, String> {
    super::settings_file::validate_current(&super::db(&app)?)?;
    let _guard = CONFIG_LOCK.lock().map_err(|_| "AI 配置暂时不可用")?;
    let mut catalog = read_catalog(&app)?;
    if settings.id.is_empty()
        || settings.id.len() > 80
        || !settings
            .id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
    {
        return Err("无效的模型配置编号".into());
    }
    let existing = catalog.profiles.iter().position(|p| p.id == settings.id);
    if existing.is_none() && (settings.id == "legacy" || catalog.profiles.len() >= 50) {
        return Err("最多保存 50 个模型配置".into());
    }
    validate_settings(&mut settings)?;
    if clear_key {
        match entry(&account(&settings))?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => (),
            Err(_) => return Err("删除系统凭据失败".into()),
        }
    } else if let Some(key) = api_key.filter(|s| !s.trim().is_empty()) {
        entry(&account(&settings))?
            .set_password(key.trim())
            .map_err(|_| "无法保存密钥到系统凭据库")?;
    }
    settings.has_key = false;
    if catalog.active_id.is_empty() {
        catalog.active_id = settings.id.clone();
    }
    if let Some(index) = existing {
        catalog.profiles[index] = settings;
    } else {
        catalog.profiles.push(settings);
    }
    write_catalog(&app, &catalog)?;
    with_key_status(catalog)
}
#[tauri::command]
pub fn ai_select_model(app: AppHandle, id: String) -> Result<Catalog, String> {
    let _guard = CONFIG_LOCK.lock().map_err(|_| "AI 配置暂时不可用")?;
    let mut catalog = read_catalog(&app)?;
    select_profile(&catalog, &id)?;
    catalog.active_id = id;
    write_catalog(&app, &catalog)?;
    with_key_status(catalog)
}
#[tauri::command]
pub fn ai_delete_model(app: AppHandle, id: String) -> Result<Catalog, String> {
    super::settings_file::validate_current(&super::db(&app)?)?;
    let _guard = CONFIG_LOCK.lock().map_err(|_| "AI 配置暂时不可用")?;
    let mut catalog = read_catalog(&app)?;
    let profile = select_profile(&catalog, &id)?;
    match entry(&account(profile))?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => (),
        Err(_) => return Err("删除系统凭据失败".into()),
    }
    catalog.profiles.retain(|p| p.id != id);
    if catalog.active_id == id {
        catalog.active_id = catalog
            .profiles
            .first()
            .map(|p| p.id.clone())
            .unwrap_or_default();
    }
    write_catalog(&app, &catalog)?;
    with_key_status(catalog)
}

fn storage(app: &AppHandle) -> Result<rusqlite::Connection, String> {
    let conn = super::db(app)?;
    conn.execute_batch("CREATE TABLE IF NOT EXISTS ai_sessions(id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);").map_err(|e| e.to_string())?;
    Ok(conn)
}
#[tauri::command]
pub fn ai_sessions(app: AppHandle) -> Result<Vec<Value>, String> {
    let conn = storage(&app)?;
    let mut stmt = conn
        .prepare("SELECT data FROM ai_sessions ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.map(|r| serde_json::from_str(&r.map_err(|e| e.to_string())?).map_err(|e| e.to_string()))
        .collect()
}
#[tauri::command]
pub fn ai_save_session(app: AppHandle, session: Value) -> Result<(), String> {
    let id = session["id"].as_str().ok_or("缺少会话编号")?;
    let data = serde_json::to_string(&session).map_err(|e| e.to_string())?;
    if data.len() > 48 * 1024 * 1024 {
        return Err("会话附件过大，请新建会话".into());
    }
    storage(&app)?.execute("INSERT INTO ai_sessions(id,data,updated_at) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at", params![id, data, super::now_ms()]).map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn ai_delete_session(app: AppHandle, id: Option<String>) -> Result<(), String> {
    let mut conn = storage(&app)?;
    conn.execute_batch("PRAGMA secure_delete = ON")
        .map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    super::ai_tools::clear_history(&tx, id.as_deref())?;
    if id.is_none() {
        super::ai_workspace::clear_history(&tx)?;
    }
    if let Some(id) = id {
        tx.execute("DELETE FROM ai_sessions WHERE id=?1", [id])
    } else {
        tx.execute("DELETE FROM ai_sessions", [])
    }
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    // Sessions contain attachment snapshots; secure_delete removes their SQL payload.
    conn.execute_batch("VACUUM").map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn ai_image(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let file = std::fs::File::open(path).map_err(|_| "无法打开图片")?;
        let mut bytes = Vec::new();
        file.take(8 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "读取图片失败")?;
        if bytes.len() > 8 * 1024 * 1024 {
            return Err("图片不能超过 8 MB".into());
        }
        let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            "image/png"
        } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            "image/jpeg"
        } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
            "image/webp"
        } else {
            return Err("仅支持 PNG、JPEG、WebP 图片".into());
        };
        Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn ai_replace_note(
    app: AppHandle,
    id: i64,
    expected: String,
    content: String,
) -> Result<(), String> {
    replace_note(&super::db(&app)?, id, &expected, &content)
}
fn replace_note(
    conn: &rusqlite::Connection,
    id: i64,
    expected: &str,
    content: &str,
) -> Result<(), String> {
    if content.trim().is_empty() || content.chars().count() > 2000 {
        return Err("速记需在 1～2000 字之间，请先精简结果".into());
    }
    let changed = conn
        .execute(
            "UPDATE notes SET content=?1,updated_at=?2 WHERE id=?3 AND content=?4",
            params![content, super::now_ms(), id, expected],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("原速记已变更或删除，请重新整理；也可另存结果".into());
    }
    Ok(())
}
#[tauri::command]
pub fn ai_add_todos(app: AppHandle, texts: Vec<String>) -> Result<(), String> {
    add_todos(&mut super::db(&app)?, texts)
}
fn add_todos(conn: &mut rusqlite::Connection, texts: Vec<String>) -> Result<(), String> {
    if texts.is_empty()
        || texts.len() > 50
        || texts
            .iter()
            .any(|t| t.trim().is_empty() || t.chars().count() > 200)
    {
        return Err("请选择 1～50 项待办，每项不超过 200 字".into());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for text in texts {
        tx.execute(
            "INSERT INTO todos(text,created_at) VALUES(?1,?2)",
            params![text.trim(), super::now_ms()],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

type Cancels = Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>;
static CANCELS: OnceLock<Cancels> = OnceLock::new();
fn cancels() -> &'static Cancels {
    CANCELS.get_or_init(|| Mutex::new(HashMap::new()))
}
pub(super) async fn workspace_transport(
    app: AppHandle,
    profile_id: String,
    model_override: String,
) -> Result<(reqwest::Client, String, String, String, bool), String> {
    let (mut settings, key) = tauri::async_runtime::spawn_blocking(move || {
        let _guard = CONFIG_LOCK.lock().map_err(|_| "AI 配置暂时不可用")?;
        let s = execution_profile(&read_catalog(&app)?, &profile_id)?.clone();
        let key = secret(&account(&s))?;
        Ok::<_, String>((s, key))
    })
    .await
    .map_err(|e| e.to_string())??;
    if !model_override.trim().is_empty() {
        settings.model = model_override;
    }
    let url = endpoint(&settings.base_url)?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    Ok((client, url, settings.model, key, settings.vision))
}
#[tauri::command]
pub fn ai_cancel(request_id: String) {
    if let Some(tx) = cancels().lock().unwrap().remove(&request_id) {
        let _ = tx.send(());
    }
}
#[derive(Deserialize)]
pub struct Message {
    role: String,
    content: Value,
}
#[tauri::command]
pub async fn ai_generate(
    app: AppHandle,
    webview: tauri::Webview,
    request_id: String,
    profile_id: String,
    messages: Vec<Message>,
    on_delta: Channel<String>,
    allow_tools: Option<bool>,
    tool_scope: Option<String>,
    client_time: Option<String>,
    on_tool: Option<tauri::ipc::JavaScriptChannelId>,
) -> Result<String, String> {
    let on_tool = on_tool.map(|id| id.channel_on(webview));
    let (tx, rx) = tokio::sync::oneshot::channel();
    {
        let mut active = cancels().lock().unwrap();
        if active.contains_key(&request_id) {
            return Err("请求编号重复".into());
        }
        active.insert(request_id.clone(), tx);
    }
    let result = tokio::select! {
        _ = rx => Err("已停止生成".into()),
        result = generate(app, profile_id, messages, on_delta, allow_tools.unwrap_or(false),tool_scope.unwrap_or_default(),client_time.unwrap_or_default(),on_tool) => result,
    };
    cancels().lock().unwrap().remove(&request_id);
    result
}
async fn generate(
    app: AppHandle,
    profile_id: String,
    messages: Vec<Message>,
    on_delta: Channel<String>,
    allow_tools: bool,
    tool_scope: String,
    client_time: String,
    on_tool: Option<Channel<super::ai_agent::ToolEvent>>,
) -> Result<String, String> {
    let tool_app = app.clone();
    let (settings, key) = tauri::async_runtime::spawn_blocking(move || {
        let _guard = CONFIG_LOCK.lock().map_err(|_| "AI 配置暂时不可用")?;
        let settings = select_profile(&read_catalog(&app)?, &profile_id)?.clone();
        let key = secret(&account(&settings))?;
        Ok::<_, String>((settings, key))
    })
    .await
    .map_err(|e| e.to_string())??;
    if settings.model.is_empty() {
        return Err("请先在设置中配置 AI 服务".into());
    }
    if messages.is_empty() || messages.len() > 200 {
        return Err("会话过长，请新建会话".into());
    }
    let mut input = Vec::new();
    for message in messages {
        if !["system", "user", "assistant"].contains(&message.role.as_str()) {
            return Err("无效消息角色".into());
        }
        if message.content.is_array() && !settings.vision {
            return Err("请先在 AI 设置中启用支持图片的模型".into());
        }
        input.push(json!({"role":message.role,"content":message.content}));
    }
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "无法初始化网络连接")?;
    if allow_tools {
        return super::ai_agent::run(
            tool_app,
            client,
            endpoint(&settings.base_url)?,
            settings.model,
            key,
            input,
            tool_scope,
            client_time,
            on_delta,
            on_tool.ok_or("缺少工具执行记录通道")?,
        )
        .await;
    }
    let mut request = client
        .post(endpoint(&settings.base_url)?)
        .json(&json!({"model":settings.model,"messages":input,"stream":true}));
    if !key.is_empty() {
        request = request.bearer_auth(key);
    }
    let mut response = request
        .send()
        .await
        .map_err(|_| "连接失败或超时，请检查服务地址和网络")?;
    if !response.status().is_success() {
        return Err(format!(
            "模型服务返回 HTTP {}；请检查地址、密钥、模型与额度",
            response.status().as_u16()
        ));
    }
    let mut parser = StreamParser::default();
    let mut output = String::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "接收中断，请重试")? {
        for delta in parser.push(&chunk)? {
            if output.len() + delta.len() > 512 * 1024 {
                return Err("回答过长，已停止接收".into());
            }
            output.push_str(&delta);
            on_delta.send(delta).map_err(|_| "页面连接已断开")?;
        }
        if parser.done {
            break;
        }
    }
    if !parser.done {
        return Err("响应未完整结束，请检查服务是否支持流式 Chat Completions，或重试".into());
    }
    if output.trim().is_empty() {
        return Err("模型没有返回文字，请确认模型能力或重试".into());
    }
    Ok(output)
}

#[derive(Default)]
struct StreamParser {
    pending: Vec<u8>,
    done: bool,
}
impl StreamParser {
    fn push(&mut self, bytes: &[u8]) -> Result<Vec<String>, String> {
        self.pending.extend_from_slice(bytes);
        if self.pending.len() > 1024 * 1024 {
            return Err("服务返回了不支持的响应格式".into());
        }
        let mut deltas = Vec::new();
        while let Some(end) = self.pending.iter().position(|b| *b == b'\n') {
            let line: Vec<_> = self.pending.drain(..=end).collect();
            let line = std::str::from_utf8(&line)
                .map_err(|_| "响应编码无效")?
                .trim();
            if let Some(data) = line.strip_prefix("data:").map(str::trim) {
                if data == "[DONE]" {
                    self.done = true;
                    break;
                }
                let value: Value = serde_json::from_str(data).map_err(|_| "流式响应格式无效")?;
                if value.get("error").is_some() {
                    return Err("模型服务报告生成失败，请检查模型与额度".into());
                }
                if let Some(text) = value["choices"][0]["delta"]["content"].as_str() {
                    deltas.push(text.into());
                }
            }
        }
        Ok(deltas)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn model_lists_validate_endpoints_and_ignore_invalid_ids() {
        assert_eq!(
            models_endpoint("https://example.org/v1/chat/completions/").unwrap(),
            "https://example.org/v1/models"
        );
        assert_eq!(
            models_endpoint("http://localhost:1234/v1").unwrap(),
            "http://localhost:1234/v1/models"
        );
        assert!(models_endpoint("https://example.org/v1?key=secret").is_err());
        assert!(models_endpoint("http://example.org/v1").is_err());
        assert_eq!(parse_models(json!({"data":[{"id":"beta"},{"id":"alpha"},{"id":"beta"},{"id":""},{"id":"bad\nmodel"},{}]})).unwrap(), vec!["alpha", "beta"]);
        assert!(parse_models(json!({"error":"private upstream detail"}))
            .unwrap_err()
            .contains("格式不兼容"));
        assert!(parse_models(json!({"data":[]})).unwrap().is_empty());
    }
    #[test]
    fn mappings_round_trip_and_validate_selection_without_changing_legacy_models() {
        let mut settings = Settings {
            name: "Service".into(),
            model: "actual-a".into(),
            base_url: "https://example.org/v1".into(),
            ..Settings::default()
        };
        assert!(validate_settings(&mut settings).is_ok());
        settings.model_mappings = vec![
            ModelMapping {
                name: "日常".into(),
                model: "actual-a".into(),
            },
            ModelMapping {
                name: "翻译".into(),
                model: "actual-b".into(),
            },
        ];
        settings.model = "actual-b".into();
        validate_settings(&mut settings).unwrap();
        let restored: Settings =
            serde_json::from_value(serde_json::to_value(&settings).unwrap()).unwrap();
        assert_eq!(restored.model, "actual-b");
        assert_eq!(restored.model_mappings[1].name, "翻译");
        settings.model = "missing".into();
        assert!(validate_settings(&mut settings)
            .unwrap_err()
            .contains("选中"));
        settings.model = "actual-a".into();
        settings.model_mappings[1].model = "actual-a".into();
        assert!(validate_settings(&mut settings)
            .unwrap_err()
            .contains("重复"));
    }
    #[test]
    fn model_list_http_uses_get_and_does_not_follow_redirects_or_expose_errors() {
        use std::io::{Read, Write};
        for (status, body, expected_error) in [
            ("200 OK", r#"{"data":[{"id":"test-model"}]}"#, false),
            ("302 Found", "secret-test-key", true),
            ("401 Unauthorized", "secret-test-key", true),
        ] {
            let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = server.local_addr().unwrap();
            let task = std::thread::spawn(move || {
                let (mut stream, _) = server.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut bytes = [0; 4096];
                let count = stream.read(&mut bytes).unwrap();
                let request = String::from_utf8_lossy(&bytes[..count]).to_lowercase();
                assert!(request.starts_with("get /v1/models "));
                assert!(request.contains("authorization: bearer secret-test-key"));
                write!(stream, "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\nLocation: http://127.0.0.1:1/leak\r\n\r\n{body}", body.len()).unwrap();
            });
            let result = tauri::async_runtime::block_on(fetch_models(
                &format!("http://{address}/v1"),
                "secret-test-key",
            ));
            task.join().unwrap();
            if expected_error {
                assert!(!result.unwrap_err().contains("secret-test-key"));
            } else {
                assert_eq!(result.unwrap(), vec!["test-model"]);
            }
        }
    }
    #[test]
    fn endpoint_validation() {
        assert_eq!(
            endpoint("http://localhost:11434/v1/").unwrap(),
            "http://localhost:11434/v1/chat/completions"
        );
        assert!(endpoint("http://remote.example/v1").is_err());
        assert!(endpoint("https://user:secret@example.com/v1").is_err());
        assert!(endpoint("https://example.com/v1?key=secret").is_err());
        assert_eq!(
            endpoint("https://example.com/v1/chat/completions").unwrap(),
            "https://example.com/v1/chat/completions"
        );
    }
    #[test]
    fn stream_handles_split_utf8_and_multiple_frames() {
        let bytes =
            "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\r\n\r\ndata: [DONE]\n\n"
                .as_bytes();
        for split in 0..bytes.len() {
            let mut p = StreamParser::default();
            let mut result = p.push(&bytes[..split]).unwrap();
            result.extend(p.push(&bytes[split..]).unwrap());
            assert_eq!(result.concat(), "你好");
            assert!(p.done);
        }
    }
    #[test]
    fn stream_rejects_provider_errors_and_malformed_data() {
        assert!(StreamParser::default()
            .push(b"data: {\"error\":{}}\n")
            .is_err());
        assert!(StreamParser::default().push(b"data: invalid\n").is_err());
    }
    #[test]
    fn stream_ignores_metadata_and_keeps_incomplete_frames_pending() {
        let mut parser = StreamParser::default();
        assert!(parser.push(b": keepalive\n\nevent: message\ndata: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}\n\n").unwrap().is_empty());
        assert!(parser
            .push(b"data: {\"choices\":[{\"delta\":{\"content\":\"par")
            .unwrap()
            .is_empty());
        assert_eq!(parser.push(b"tial\"}}]}\n\n").unwrap(), vec!["partial"]);
        assert!(!parser.done);
        assert!(StreamParser::default()
            .push(&vec![b'x'; 1024 * 1024 + 1])
            .is_err());
    }
    fn test_db() -> rusqlite::Connection {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        super::super::initialize_schema(&mut conn).unwrap();
        conn
    }
    #[test]
    fn replace_and_undo_use_compare_and_swap_and_preserve_newer_edits() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO notes(id,content,created_at,updated_at) VALUES(1,'original',1,1)",
            [],
        )
        .unwrap();
        replace_note(&conn, 1, "original", "organized").unwrap();
        assert!(replace_note(&conn, 1, "original", "stale").is_err());
        replace_note(&conn, 1, "organized", "original").unwrap();
        assert!(replace_note(&conn, 1, "original", " ").is_err());
        assert!(replace_note(&conn, 1, "original", &"字".repeat(2001)).is_err());
        assert_eq!(
            conn.query_row("SELECT content FROM notes WHERE id=1", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            "original"
        );
        conn.execute("DELETE FROM notes", []).unwrap();
        assert!(replace_note(&conn, 1, "original", "missing").is_err());
    }
    #[test]
    fn todo_batches_validate_before_writing_and_roll_back_database_failures() {
        let mut conn = test_db();
        assert!(add_todos(&mut conn, vec!["valid".into(), " ".into()]).is_err());
        assert!(add_todos(&mut conn, vec!["字".repeat(201)]).is_err());
        assert!(add_todos(&mut conn, vec!["task".into(); 51]).is_err());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM todos", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
        conn.execute_batch("CREATE TRIGGER reject_test BEFORE INSERT ON todos WHEN NEW.text='fail' BEGIN SELECT RAISE(ABORT, 'test failure'); END;").unwrap();
        assert!(add_todos(&mut conn, vec!["first".into(), "fail".into()]).is_err());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM todos", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
        add_todos(&mut conn, vec![" first ".into(), "second".into()]).unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM todos WHERE completed=0", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            conn.query_row("SELECT text FROM todos ORDER BY id LIMIT 1", [], |r| r
                .get::<_, String>(
                0
            ))
            .unwrap(),
            "first"
        );
    }
}
