//! Draft-only connection checks. They never write settings, credentials or history.
use super::{
    account, cancels, endpoint, read_catalog, secret, validate_settings, Settings, CONFIG_LOCK,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tauri::AppHandle;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionFailure {
    kind: String,
    status: Option<u16>,
    code: Option<String>,
    detail: Option<String>,
}
impl ConnectionFailure {
    fn new(kind: &str) -> Self {
        Self {
            kind: kind.into(),
            status: None,
            code: None,
            detail: None,
        }
    }
    fn local(detail: String) -> Self {
        Self {
            detail: Some(detail),
            ..Self::new("configuration")
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionReport {
    elapsed_ms: u64,
}

fn is_glm(base: &str) -> bool {
    reqwest::Url::parse(base)
        .ok()
        .is_some_and(|u| matches!(u.host_str(), Some("open.bigmodel.cn" | "api.z.ai")))
}
fn test_body(settings: &Settings) -> Value {
    let mut body = json!({"model":settings.model,"messages":[{"role":"user","content":"Reply OK only."}],"stream":false});
    if is_glm(&settings.base_url)
        && ["glm-5", "glm-4.5", "glm-4.6", "glm-4.7"]
            .iter()
            .any(|p| settings.model.to_ascii_lowercase().starts_with(p))
    {
        body["thinking"] = json!({"type":"disabled"});
        body["max_tokens"] = json!(128);
    }
    body
}
fn rejected(status: u16, value: &Value, glm: bool) -> ConnectionFailure {
    // Do not reflect arbitrary provider messages, HTML, request bodies or keys.
    let raw = value["error"]["code"]
        .as_str()
        .map(str::to_owned)
        .or_else(|| value["error"]["code"].as_u64().map(|v| v.to_string()));
    let code = raw.filter(|s| {
        (!s.is_empty() && s.len() <= 6 && s.bytes().all(|b| b.is_ascii_digit()))
            || [
                "invalid_api_key",
                "authentication_error",
                "model_not_found",
                "insufficient_quota",
                "rate_limit_exceeded",
                "invalid_request_error",
                "unsupported_parameter",
            ]
            .contains(&s.as_str())
    });
    let kind = match code.as_deref() {
        Some("1113") if glm => "balance",
        Some("1308" | "1310") if glm => "quota",
        Some("1309") if glm => "expired",
        Some("1211" | "1311") if glm => "model",
        Some("1214" | "1215") if glm => "parameters",
        Some("invalid_api_key" | "authentication_error") => "authentication",
        Some("model_not_found") => "model",
        Some("insufficient_quota") => "quota",
        Some("rate_limit_exceeded") => "rate",
        _ => match status {
            401 | 403 => "authentication",
            402 => "balance",
            404 | 405 => "endpoint",
            429 => "rate",
            400 | 422 => "parameters",
            _ => "provider",
        },
    };
    ConnectionFailure {
        kind: kind.into(),
        status: Some(status),
        code,
        detail: None,
    }
}

async fn probe(
    settings: &Settings,
    key: &str,
    timeout: Duration,
) -> Result<ConnectionReport, ConnectionFailure> {
    let url = endpoint(&settings.base_url).map_err(ConnectionFailure::local)?;
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none());
    let parsed = reqwest::Url::parse(&url).map_err(|_| ConnectionFailure::new("configuration"))?;
    if matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")) {
        builder = builder.no_proxy();
    }
    let client = builder
        .build()
        .map_err(|_| ConnectionFailure::new("network"))?;
    let mut request = client.post(url).json(&test_body(settings));
    if !key.is_empty() {
        request = request.bearer_auth(key);
    }
    let start = Instant::now();
    let network = |e: reqwest::Error| {
        ConnectionFailure::new(if e.is_timeout() { "timeout" } else { "network" })
    };
    let mut response = request.send().await.map_err(network)?;
    let status = response.status().as_u16();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network)? {
        if bytes.len() + chunk.len() > 256 * 1024 {
            return Err(ConnectionFailure::new("response"));
        }
        bytes.extend_from_slice(&chunk);
    }
    let value = serde_json::from_slice::<Value>(&bytes).unwrap_or(Value::Null);
    if !(200..300).contains(&status) || value.get("error").is_some() {
        return Err(rejected(status, &value, is_glm(&settings.base_url)));
    }
    if value["choices"][0]["message"]["content"]
        .as_str()
        .is_none_or(|s| s.trim().is_empty())
    {
        return Err(ConnectionFailure::new("response"));
    }
    Ok(ConnectionReport {
        elapsed_ms: start.elapsed().as_millis() as u64,
    })
}

#[tauri::command]
pub async fn ai_test_connection(
    app: AppHandle,
    request_id: String,
    mut settings: Settings,
    api_key: Option<String>,
) -> Result<ConnectionReport, ConnectionFailure> {
    if request_id.is_empty()
        || request_id.len() > 120
        || !request_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(ConnectionFailure::new("configuration"));
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    {
        let mut active = cancels()
            .lock()
            .map_err(|_| ConnectionFailure::new("configuration"))?;
        if active.contains_key(&request_id) {
            return Err(ConnectionFailure::new("configuration"));
        }
        active.insert(request_id.clone(), tx);
    }
    let execute = async {
        // Only connection fields are required; unfinished aliases are not saved.
        settings.name = "Connection test".into();
        settings.language = "中文".into();
        settings.model_mappings.clear();
        let parsed = reqwest::Url::parse(settings.base_url.trim())
            .map_err(|_| ConnectionFailure::new("configuration"))?;
        if is_glm(settings.base_url.trim())
            && (parsed.path().starts_with("/api/anthropic") || parsed.path().starts_with("/api/v1"))
        {
            return Err(ConnectionFailure::new("glmProtocol"));
        }
        validate_settings(&mut settings).map_err(ConnectionFailure::local)?;
        let lookup = settings.clone();
        let key = tauri::async_runtime::spawn_blocking(move || {
            if let Some(key) = api_key.filter(|k| !k.trim().is_empty()) {
                return Ok(key.trim().to_owned());
            }
            let _guard = CONFIG_LOCK
                .lock()
                .map_err(|_| ConnectionFailure::new("credentials"))?;
            let catalog = read_catalog(&app).map_err(ConnectionFailure::local)?;
            match catalog
                .profiles
                .iter()
                .find(|p| p.id == lookup.id && p.base_url == lookup.base_url)
            {
                Some(profile) => secret(&account(profile)).map_err(ConnectionFailure::local),
                None => Ok(String::new()),
            }
        })
        .await
        .map_err(|_| ConnectionFailure::new("credentials"))??;
        if key.is_empty() && !matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
        {
            return Err(ConnectionFailure::new("credentials"));
        }
        probe(&settings, &key, Duration::from_secs(45)).await
    };
    let result =
        tokio::select! {_ = rx=>Err(ConnectionFailure::new("cancelled")),value=execute=>value};
    cancels()
        .lock()
        .map_err(|_| ConnectionFailure::new("configuration"))?
        .remove(&request_id);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn glm_coding_and_standard_requests_disable_thinking_only_for_supported_glm_models() {
        assert!(endpoint("https://open.bigmodel.cn/api/anthropic")
            .unwrap_err()
            .contains("Coding Plan"));
        assert!(endpoint("https://open.bigmodel.cn/api/v1").is_err());
        let mut s = Settings::default();
        s.model = "glm-5.3".into();
        s.base_url = "https://open.bigmodel.cn/api/coding/paas/v4".into();
        assert_eq!(test_body(&s)["thinking"]["type"], "disabled");
        assert_eq!(test_body(&s)["max_tokens"], 128);
        s.base_url = "https://example.com/v1".into();
        assert!(test_body(&s).get("thinking").is_none());
        assert_eq!(
            endpoint("https://open.bigmodel.cn/api/coding/paas/v4").unwrap(),
            "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions"
        );
    }
    #[test]
    fn upstream_diagnostics_distinguish_plan_balance_and_model_failures_without_leaking_bodies() {
        let failure = rejected(
            429,
            &json!({"error":{"code":"1113","message":"private-key-and-response"}}),
            true,
        );
        assert_eq!(failure.kind, "balance");
        assert_eq!(failure.code.as_deref(), Some("1113"));
        assert!(!serde_json::to_string(&failure).unwrap().contains("private"));
        assert_eq!(
            rejected(404, &json!({"error":{"code":"model_not_found"}}), false).kind,
            "model"
        );
        assert!(rejected(
            401,
            &json!({"error":{"code":"secret-token-do-not-reflect"}}),
            false
        )
        .code
        .is_none());
    }
    #[test]
    fn real_http_probe_uses_draft_model_and_bearer_auth_and_validates_text() {
        use std::io::{BufRead, BufReader, Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut header = String::new();
            let mut length = 0;
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                if line == "\r\n" {
                    break;
                }
                if line.to_ascii_lowercase().starts_with("content-length:") {
                    length = line
                        .split(':')
                        .nth(1)
                        .unwrap()
                        .trim()
                        .parse::<usize>()
                        .unwrap();
                }
                header.push_str(&line);
            }
            let mut body = vec![0; length];
            reader.read_exact(&mut body).unwrap();
            let value: Value = serde_json::from_slice(&body).unwrap();
            assert!(header.starts_with("POST /v1/chat/completions "));
            assert!(header
                .to_ascii_lowercase()
                .contains("authorization: bearer unit-test-key"));
            assert_eq!(value["model"], "draft-model");
            assert_eq!(value["stream"], false);
            let output = r#"{"choices":[{"message":{"content":"OK"}}]}"#;
            write!(stream,"HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{}",output.len(),output).unwrap();
        });
        let mut s = Settings::default();
        s.base_url = format!("http://{address}/v1");
        s.model = "draft-model".into();
        assert!(
            tauri::async_runtime::block_on(probe(&s, "unit-test-key", Duration::from_secs(3)))
                .is_ok()
        );
        worker.join().unwrap();
    }
}
