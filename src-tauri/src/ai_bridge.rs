//! Per-task MCP stdio bridge. No persistent CLI configuration or HTTP endpoint.
use super::{ai_agent::Host, ai_tools::Outcome, ai_workspace::Runtime};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    process::Command,
    sync::{atomic::Ordering, Arc},
    thread::JoinHandle,
    time::Duration,
};
use tauri::AppHandle;

const PORT: &str = "MY_ASSISTANT_BRIDGE_PORT";
const TOKEN: &str = "MY_ASSISTANT_BRIDGE_TOKEN";
const LIMIT: u64 = 1024 * 1024;

fn line(reader: impl Read, limit: u64) -> Result<String, String> {
    let mut text = String::new();
    BufReader::new(reader.take(limit + 1))
        .read_line(&mut text)
        .map_err(|e| e.to_string())?;
    if text.len() as u64 > limit || !text.ends_with('\n') {
        return Err("MCP 消息过长或不完整".into());
    }
    Ok(text)
}
fn error(id: Value, code: i32, message: &str) -> Value {
    json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})
}
fn exposed(name: &str) -> bool {
    name.starts_with("assistant_")
        || name.starts_with("agent_desktop_")
        || ["agent_list_launchers", "agent_open_launcher"].contains(&name)
}
fn tool_result(mut outcome: Outcome) -> Value {
    let image = outcome
        .data
        .as_object_mut()
        .and_then(|d| d.remove("image_url"));
    let mut content =
        vec![json!({"type":"text","text":serde_json::to_string(&outcome).unwrap_or_default()})];
    if let Some(image) = image.and_then(|v| v.as_str().map(str::to_owned)) {
        if let Some((mime, data)) = image
            .strip_prefix("data:")
            .and_then(|v| v.split_once(";base64,"))
        {
            if ["image/png", "image/jpeg", "image/webp"].contains(&mime) {
                content.push(json!({"type":"image","mimeType":mime,"data":data}));
            }
        }
    }
    json!({"content":content,"isError":!outcome.ok})
}
fn request(host: &dyn Host, runtime: &Runtime, value: &Value) -> Value {
    let id = value["id"].clone();
    if runtime.check().is_err() {
        return error(id, -32000, "任务已结束");
    }
    let definitions = || {
        host.definitions()
            .into_iter()
            .filter(|d| d["function"]["name"].as_str().is_some_and(exposed))
            .collect::<Vec<_>>()
    };
    let result = match value["method"].as_str().unwrap_or_default() {
        "initialize" => {
            let version = value["params"]["protocolVersion"]
                .as_str()
                .unwrap_or_default();
            let version =
                if ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"].contains(&version) {
                    version
                } else {
                    "2025-03-26"
                };
            json!({"protocolVersion":version,"capabilities":{"tools":{}},"serverInfo":{"name":"my-assistant","version":env!("CARGO_PKG_VERSION")}})
        }
        "ping" => json!({}),
        "tools/list" => {
            json!({"tools":definitions().into_iter().map(|d|json!({"name":d["function"]["name"],"description":d["function"]["description"],"inputSchema":d["function"]["parameters"]})).collect::<Vec<_>>()})
        }
        "tools/call" => {
            let name = value["params"]["name"].as_str().unwrap_or_default();
            let args = value["params"]
                .get("arguments")
                .cloned()
                .unwrap_or(json!({}));
            if !args.is_object()
                || args.to_string().len() > 32 * 1024
                || !definitions().iter().any(|d| d["function"]["name"] == name)
            {
                return error(id, -32602, "工具未授权或参数无效");
            }
            let call_id = uuid::Uuid::new_v4().to_string();
            let title = super::ai_tools::title(name);
            runtime.emit(json!({"type":"tool","event":{"callId":call_id,"name":name,"title":title,"state":"running","result":null}}));
            let outcome = host.execute(&format!("agent-{}", runtime.id), name, args);
            let mut visible = outcome.clone();
            if let Some(data) = visible.data.as_object_mut() {
                data.remove("image_url");
            }
            runtime.emit(json!({"type":"tool","event":{"callId":call_id,"name":name,"title":title,"state":if outcome.ok {"success"} else {"error"},"result":visible}}));
            tool_result(outcome)
        }
        _ => return error(id, -32601, "未知 MCP 方法"),
    };
    json!({"jsonrpc":"2.0","id":id,"result":result})
}

pub struct Bridge {
    port: u16,
    token: String,
    runtime: Arc<Runtime>,
    worker: Option<JoinHandle<()>>,
    config: Option<tempfile::NamedTempFile>,
}
impl Bridge {
    pub fn start(app: AppHandle, runtime: Arc<Runtime>) -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let token = uuid::Uuid::new_v4().to_string();
        let auth = token.clone();
        let r = runtime.clone();
        let host = super::ai_files::FileHost::new(app, r.clone(), true);
        let worker = std::thread::spawn(move || {
            while r.check().is_ok() {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        // Accepted Windows sockets inherit the listener's mode.
                        let _ = stream.set_nonblocking(false);
                        let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
                        let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
                        let response = (|| {
                            let raw = line(&stream, LIMIT).ok()?;
                            let value: Value = serde_json::from_str(&raw).ok()?;
                            if value["token"].as_str() != Some(auth.as_str()) {
                                return None;
                            }
                            Some(request(&host, &r, &value["request"]))
                        })();
                        if let Some(response) = response {
                            let _ = writeln!(stream, "{response}");
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(20))
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(Self {
            port,
            token,
            runtime,
            worker: Some(worker),
            config: None,
        })
    }
    pub fn configure(&mut self, kind: &str, args: &mut Vec<String>) -> Result<(), String> {
        let executable = std::env::current_exe().map_err(|e| e.to_string())?;
        let executable = super::ai_cli::native_path(&executable)
            .to_string_lossy()
            .into_owned();
        if kind == "codex" {
            for config in [
                format!(
                    "mcp_servers.my_assistant.command={}",
                    serde_json::to_string(&executable).map_err(|e| e.to_string())?
                ),
                "mcp_servers.my_assistant.args=['--ai-tool-bridge']".into(),
                format!("mcp_servers.my_assistant.env_vars=['{PORT}','{TOKEN}']"),
                "mcp_servers.my_assistant.tool_timeout_sec=660".into(),
                "mcp_servers.my_assistant.required=true".into(),
            ] {
                args.extend(["-c".into(), config]);
            }
        } else {
            let config = json!({"mcpServers":{"my_assistant":{"type":"stdio","command":executable,"args":["--ai-tool-bridge"],"env":{(PORT):self.port.to_string(),(TOKEN):self.token}}}});
            let mut file = tempfile::Builder::new()
                .prefix("assistant-mcp-")
                .suffix(".json")
                .tempfile()
                .map_err(|e| e.to_string())?;
            serde_json::to_writer(&mut file, &config).map_err(|e| e.to_string())?;
            file.flush().map_err(|e| e.to_string())?;
            args.extend([
                "--mcp-config".into(),
                super::ai_cli::native_path(file.path())
                    .to_string_lossy()
                    .into_owned(),
                "--allowedTools".into(),
                "mcp__my_assistant__*".into(),
            ]);
            self.config = Some(file);
        }
        Ok(())
    }
    pub fn environment(&self, command: &mut Command) {
        command
            .env(PORT, self.port.to_string())
            .env(TOKEN, &self.token);
    }
}
impl Drop for Bridge {
    fn drop(&mut self) {
        self.runtime.finished.store(true, Ordering::Relaxed);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

/// Called before Tauri starts, including release builds launched as an MCP child.
pub fn run_stdio_bridge() -> bool {
    if std::env::args().nth(1).as_deref() != Some("--ai-tool-bridge") {
        return false;
    }
    let result = (|| -> Result<(), String> {
        let port: u16 = std::env::var(PORT)
            .map_err(|_| "缺少桥接端口")?
            .parse()
            .map_err(|_| "桥接端口无效")?;
        let token = std::env::var(TOKEN).map_err(|_| "缺少桥接凭据")?;
        if token.len() != 36 {
            return Err("桥接凭据无效".into());
        }
        let stdin = std::io::stdin();
        let mut input = stdin.lock();
        let stdout = std::io::stdout();
        let mut out = stdout.lock();
        loop {
            let mut raw = String::new();
            if input
                .by_ref()
                .take(LIMIT + 1)
                .read_line(&mut raw)
                .map_err(|e| e.to_string())?
                == 0
            {
                break;
            }
            if raw.len() as u64 > LIMIT || !raw.ends_with('\n') {
                return Err("MCP 消息过长或不完整".into());
            }
            let value: Value = match serde_json::from_str(&raw) {
                Ok(v) => v,
                Err(_) => {
                    writeln!(out, "{}", error(Value::Null, -32700, "JSON 格式无效"))
                        .map_err(|e| e.to_string())?;
                    out.flush().map_err(|e| e.to_string())?;
                    continue;
                }
            };
            if value.get("id").is_none() {
                continue;
            }
            let response = (|| -> Result<Value, String> {
                let mut stream = TcpStream::connect_timeout(
                    &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
                    Duration::from_secs(2),
                )
                .map_err(|e| e.to_string())?;
                stream
                    .set_read_timeout(Some(Duration::from_secs(665)))
                    .map_err(|e| e.to_string())?;
                stream
                    .set_write_timeout(Some(Duration::from_secs(5)))
                    .map_err(|e| e.to_string())?;
                writeln!(stream, "{}", json!({"token":token,"request":value}))
                    .map_err(|e| e.to_string())?;
                serde_json::from_str(&line(&stream, 32 * LIMIT)?).map_err(|e| e.to_string())
            })()
            .unwrap_or_else(|_| error(value["id"].clone(), -32000, "小助手任务已结束或桥接不可用"));
            writeln!(out, "{response}").map_err(|e| e.to_string())?;
            out.flush().map_err(|e| e.to_string())?;
        }
        Ok(())
    })();
    if let Err(message) = result {
        eprintln!("{message}");
    }
    true
}

#[cfg(test)]
mod tests {
    use super::super::ai_workspace::Permission;
    use super::*;
    struct Fake;
    impl Host for Fake {
        fn definitions(&self) -> Vec<Value> {
            vec![
                json!({"function":{"name":"assistant_create_todo","parameters":{"type":"object"}}}),
                json!({"function":{"name":"agent_write_file","parameters":{"type":"object"}}}),
            ]
        }
        fn execute(&self, _: &str, _: &str, args: Value) -> Outcome {
            Outcome {
                ok: true,
                data: args,
                error: None,
                reused: false,
            }
        }
    }
    #[test]
    fn bridge_exposes_only_authorized_app_tools_and_stops_after_task() {
        let r = Runtime::test(Permission::default());
        let list = request(&Fake, &r, &json!({"id":1,"method":"tools/list"}));
        assert_eq!(list["result"]["tools"].as_array().unwrap().len(), 1);
        let bad = request(
            &Fake,
            &r,
            &json!({"id":2,"method":"tools/call","params":{"name":"agent_write_file","arguments":{}}}),
        );
        assert_eq!(bad["error"]["code"], -32602);
        let good = request(
            &Fake,
            &r,
            &json!({"id":3,"method":"tools/call","params":{"name":"assistant_create_todo","arguments":{"text":"hello"}}}),
        );
        assert_eq!(good["result"]["isError"], false);
        r.finished.store(true, Ordering::Relaxed);
        assert_eq!(
            request(&Fake, &r, &json!({"id":4,"method":"tools/list"}))["error"]["code"],
            -32000
        );
    }
    #[test]
    fn images_are_mcp_content_and_never_duplicate_in_text() {
        let result = tool_result(Outcome {
            ok: true,
            data: json!({"image_url":"data:image/png;base64,YQ==","width":1}),
            error: None,
            reused: false,
        });
        assert_eq!(result["content"][1]["data"], "YQ==");
        assert!(!result["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("base64"));
        assert!(line(&b"123456789\n"[..], 5).is_err());
    }

    #[test]
    fn loopback_json_rpc_reads_complete_lines_on_windows() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let worker = std::thread::spawn(move || {
            let (mut stream, _) = loop {
                match listener.accept() {
                    Ok(s) => break s,
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5))
                    }
                    Err(e) => panic!("{e}"),
                }
            };
            stream.set_nonblocking(false).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let value: Value = serde_json::from_str(&line(&stream, LIMIT).unwrap()).unwrap();
            let response = request(&Fake, &Runtime::test(Permission::default()), &value);
            writeln!(stream, "{response}").unwrap();
        });
        let mut stream = TcpStream::connect(address).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        std::thread::sleep(Duration::from_millis(30));
        writeln!(stream, "{}", json!({"id":1,"method":"tools/list"})).unwrap();
        let response: Value = serde_json::from_str(&line(&stream, LIMIT).unwrap()).unwrap();
        assert_eq!(
            response["result"]["tools"][0]["name"],
            "assistant_create_todo"
        );
        worker.join().unwrap();
    }
}
