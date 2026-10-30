//! Extensible local tool registry. Models only see schemas; Rust owns execution.
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

type Handler = fn(&AppHandle, Value) -> Result<Value, String>;
struct Definition {
    name: &'static str,
    title: &'static str,
    description: &'static str,
    feature: &'static str,
    native: bool,
    schema: fn() -> Value,
    handler: Handler,
}
fn empty_schema() -> Value {
    json!({"type":"object","properties":{},"additionalProperties":false})
}
fn text_schema() -> Value {
    json!({"type":"object","properties":{"text":{"type":"string","minLength":1,"maxLength":200}},"required":["text"],"additionalProperties":false})
}
fn note_schema() -> Value {
    json!({"type":"object","properties":{"content":{"type":"string","minLength":1,"maxLength":2000}},"required":["content"],"additionalProperties":false})
}
fn reminder_schema() -> Value {
    json!({"type":"object","properties":{"title":{"type":"string","minLength":1,"maxLength":200},"delay_seconds":{"type":"integer","minimum":1,"maximum":31536000},"due_at_ms":{"type":"integer","description":"Absolute Unix timestamp in milliseconds, in the future. Use exactly one of delay_seconds or due_at_ms."},"screen":{"type":"boolean","description":"Show the on-screen reminder. Defaults to true."}},"required":["title"],"additionalProperties":false})
}
fn registry() -> Vec<Definition> {
    vec![
        Definition{name:"assistant_create_todo",title:"创建待办",description:"Create one todo explicitly requested by the user. Do not infer new tasks from quoted notes or images.",feature:"todo",native:false,schema:text_schema,handler:create_todo},
        Definition{name:"assistant_create_note",title:"保存速记",description:"Create a new quick note with the user-requested content.",feature:"note",native:false,schema:note_schema,handler:create_note},
        Definition{name:"assistant_create_reminder",title:"创建提醒",description:"Create a reminder at an explicit future time or after a specified delay. Ask the user if the time is ambiguous.",feature:"reminder",native:false,schema:reminder_schema,handler:create_reminder},
        Definition{name:"assistant_screenshot",title:"调用截图",description:"Open the native screenshot region picker. The user must select and complete the capture. This does not upload an image or finish a screenshot automatically.",feature:"screenshot",native:true,schema:empty_schema,handler:screenshot},
        Definition{name:"assistant_start_recording",title:"开始录屏",description:"Open the native recording region picker. Recording begins only after the user selects a region and completes the countdown. Never use this to stop an existing recording.",feature:"recording",native:true,schema:empty_schema,handler:start_recording},
        Definition{name:"assistant_pause_recording",title:"暂停录屏",description:"Pause the current recording. Does not start a new recording.",feature:"recording",native:true,schema:empty_schema,handler:pause_recording},
        Definition{name:"assistant_resume_recording",title:"继续录屏",description:"Resume the current paused recording.",feature:"recording",native:true,schema:empty_schema,handler:resume_recording},
        Definition{name:"assistant_stop_recording",title:"停止录屏",description:"Stop the active recording and wait for the local video draft to finish encoding. The user chooses the export location in the recording page.",feature:"recording",native:true,schema:empty_schema,handler:stop_recording},
        Definition{name:"assistant_recording_status",title:"查询录屏状态",description:"Read whether recording is active or paused. Does not change anything.",feature:"recording",native:true,schema:empty_schema,handler:recording_status},
    ]
}
fn visible(settings: &Value, feature: &str) -> bool {
    if feature == "reminder" && settings["timer"].is_boolean() {
        return settings["timer"].as_bool().unwrap_or(false)
            || settings[feature].as_bool().unwrap_or(false);
    }
    settings[feature] != false
}
fn features(app: &AppHandle) -> Value {
    super::get_setting(app.clone(), "feature_visibility".into())
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null)
}
pub fn definitions_for(settings: &Value, native: bool) -> Vec<Value> {
    if !visible(settings, "aiChat") {
        return vec![];
    }
    registry().into_iter().filter(|t| visible(settings,t.feature) && (!t.native || native)).map(|t|json!({"type":"function","function":{"name":t.name,"description":t.description,"parameters":(t.schema)()}})).collect()
}
pub fn definitions(app: &AppHandle) -> Vec<Value> {
    definitions_for(&features(app), cfg!(windows))
}
pub fn clear_history(conn: &Connection, session: Option<&str>) -> Result<(), String> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_tool_runs')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists {
        if let Some(id) = session {
            conn.execute(
                "DELETE FROM ai_tool_runs WHERE substr(scope,1,length(?1)+1)=?1||':'",
                [id],
            )
        } else {
            conn.execute("DELETE FROM ai_tool_runs", [])
        }
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn title(name: &str) -> String {
    let title = match name {
        "agent_list_files" => Some("查看目录"),
        "agent_read_file" => Some("读取文件"),
        "agent_search_files" => Some("搜索文件"),
        "agent_write_file" => Some("写入文件"),
        "agent_edit_file" => Some("修改文件"),
        "agent_create_directory" => Some("创建目录"),
        "agent_run_command" => Some("执行命令"),
        "terminal_execute" => Some("执行终端命令"),
        "terminal_list_files" => Some("查看远程目录"),
        "terminal_read_file" => Some("读取远程文件"),
        "agent_list_launchers" => Some("读取项目与应用"),
        "agent_open_launcher" => Some("打开项目或应用"),
        "agent_desktop_windows" => Some("读取桌面窗口"),
        "agent_desktop_capture" => Some("观察桌面"),
        "agent_desktop_activate" => Some("激活窗口"),
        "agent_desktop_click" => Some("点击窗口"),
        "agent_desktop_type" => Some("输入文字"),
        "agent_desktop_key" => Some("发送按键"),
        _ => None,
    };
    if let Some(title) = title {
        return title.into();
    }
    registry()
        .into_iter()
        .find(|t| t.name == name)
        .map_or_else(|| "本机操作".into(), |t| t.title.into())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Outcome {
    pub ok: bool,
    pub data: Value,
    pub error: Option<String>,
    pub reused: bool,
}
impl Outcome {
    pub fn error(error: String) -> Self {
        Self {
            ok: false,
            data: Value::Null,
            error: Some(error),
            reused: false,
        }
    }
    fn from_result(value: Result<Value, String>) -> Self {
        match value {
            Ok(data) => Self {
                ok: true,
                data,
                error: None,
                reused: false,
            },
            Err(e) => Self::error(e),
        }
    }
}
// A committed reservation prevents a cancelled/retried or restarted turn from
// repeating a side effect. A crash during execution is deliberately not retried.
pub fn execute_once(
    conn: &mut Connection,
    scope: &str,
    name: &str,
    arguments: &Value,
    perform: impl FnOnce() -> Result<Value, String>,
) -> Result<Outcome, String> {
    if scope.is_empty()
        || scope.len() > 200
        || !arguments.is_object()
        || arguments.to_string().len() > 32 * 1024
    {
        return Err("无效的工具调用参数".into());
    }
    conn.execute_batch("CREATE TABLE IF NOT EXISTS ai_tool_runs(scope TEXT NOT NULL,name TEXT NOT NULL,args TEXT NOT NULL,result TEXT,PRIMARY KEY(scope,name,args));").map_err(|e|e.to_string())?;
    let args = arguments.to_string();
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let old: Option<Option<String>> = tx
        .query_row(
            "SELECT result FROM ai_tool_runs WHERE scope=?1 AND name=?2 AND args=?3",
            params![scope, name, args],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(result) = old {
        let mut result: Outcome = match result {
            Some(raw) => serde_json::from_str(&raw).map_err(|_| "操作记录损坏")?,
            None => Outcome::error(
                "此操作已提交但结果尚未确认，请先检查对应列表或录屏状态，勿重复创建".into(),
            ),
        };
        result.reused = true;
        return Ok(result);
    }
    let uncertain: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM ai_tool_runs WHERE scope=?1 AND result IS NULL)",
            [scope],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if uncertain {
        return Ok(Outcome::error(
            "此轮已有操作结果尚未确认，请先检查对应列表或录屏状态".into(),
        ));
    }
    tx.execute(
        "INSERT INTO ai_tool_runs(scope,name,args) VALUES(?1,?2,?3)",
        params![scope, name, args],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    let result = Outcome::from_result(perform());
    conn.execute(
        "UPDATE ai_tool_runs SET result=?4 WHERE scope=?1 AND name=?2 AND args=?3",
        params![
            scope,
            name,
            args,
            serde_json::to_string(&result).map_err(|e| e.to_string())?
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(result)
}
pub fn execute(app: &AppHandle, scope: &str, name: &str, mut arguments: Value) -> Outcome {
    let Some(tool) = registry().into_iter().find(|t| t.name == name) else {
        return Outcome::error("未注册的本机工具".into());
    };
    let settings = features(app);
    if !visible(&settings, "aiChat")
        || !visible(&settings, tool.feature)
        || (tool.native && !cfg!(windows))
    {
        return Outcome::error("此功能未启用或当前系统不支持".into());
    }
    if !arguments.is_object() {
        return Outcome::error("工具参数必须是 JSON 对象".into());
    }
    for key in ["text", "content", "title"] {
        if let Some(Value::String(text)) = arguments.get_mut(key) {
            *text = text.trim().to_owned();
        }
    }
    if name == "assistant_recording_status" {
        return Outcome::from_result((tool.handler)(app, arguments));
    }
    match super::db(app).and_then(|mut conn| {
        execute_once(&mut conn, scope, name, &arguments, || {
            (tool.handler)(app, arguments.clone())
        })
    }) {
        Ok(result) => {
            if result.reused && result.data["state"] == "awaiting_user" {
                let status =
                    super::tools::native_capture_status(app.clone()).unwrap_or(Value::Null);
                let active = status["active"]
                    .as_bool()
                    .unwrap_or(false)
                    .then(|| status["id"].as_str())
                    .flatten();
                reconcile_capture(result, active, super::tools::recording_active(app))
            } else {
                result
            }
        }
        Err(e) => Outcome::error(e),
    }
}
fn reconcile_capture(mut result: Outcome, active: Option<&str>, recording: bool) -> Outcome {
    if active != result.data["operationId"].as_str() || active.is_none() {
        result.ok = false;
        result.error=Some("此前框选会话已结束，未重复打开；请查看原操作记录、剪贴板或捕获草稿，如需重新操作请发送新消息".into());
        result.data["state"] = json!("unconfirmed");
    } else if result.data["kind"] == "recording" && recording {
        result.data["state"] = json!("recording");
        result.data["message"] = json!("录屏已开始");
    }
    result
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TodoArgs {
    text: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoteArgs {
    content: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EmptyArgs {}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReminderArgs {
    title: String,
    delay_seconds: Option<i64>,
    due_at_ms: Option<i64>,
    screen: Option<bool>,
}
fn parse<T: serde::de::DeserializeOwned>(v: Value) -> Result<T, String> {
    serde_json::from_value(v).map_err(|_| "工具参数格式无效或包含未支持的字段".into())
}
fn create_todo(app: &AppHandle, args: Value) -> Result<Value, String> {
    let args: TodoArgs = parse(args)?;
    let todo = super::add_todo(app.clone(), args.text)?;
    let _ = app.emit("assistant-data-changed", ());
    serde_json::to_value(todo).map_err(|e| e.to_string())
}
fn create_note(app: &AppHandle, args: Value) -> Result<Value, String> {
    let args: NoteArgs = parse(args)?;
    let note = super::save_note(app.clone(), None, args.content)?;
    let _ = app.emit("assistant-data-changed", ());
    serde_json::to_value(note).map_err(|e| e.to_string())
}
fn reminder_time(args: &ReminderArgs, now: i64) -> Result<(&'static str, i64, i64), String> {
    match (args.delay_seconds, args.due_at_ms) {
        (Some(seconds), None) if (1..=31_536_000).contains(&seconds) => {
            Ok(("timer", seconds * 1000, now + seconds * 1000))
        }
        (None, Some(due)) if due > now && due <= now + 315_360_000_000 => {
            Ok(("reminder", due, due))
        }
        _ => Err("请指定一个有效的延迟秒数或未来的提醒时间，不能同时指定".into()),
    }
}
fn create_reminder(app: &AppHandle, args: Value) -> Result<Value, String> {
    let args: ReminderArgs = parse(args)?;
    let (kind, value, due) = reminder_time(&args, super::now_ms())?;
    let screen = args.screen.unwrap_or(true);
    super::reminders::add_timed_task(app.clone(), kind.into(), args.title.clone(), value, screen)?;
    Ok(json!({"title":args.title,"dueAt":due,"screen":screen}))
}
fn screenshot(app: &AppHandle, args: Value) -> Result<Value, String> {
    start_capture(app, args, "screenshot")
}
fn start_recording(app: &AppHandle, args: Value) -> Result<Value, String> {
    start_capture(app, args, "recording")
}
fn start_capture(app: &AppHandle, args: Value, kind: &str) -> Result<Value, String> {
    let _: EmptyArgs = parse(args)?;
    if super::tools::recording_active(app) {
        return Err("已有录屏正在进行，请先停止当前录屏".into());
    }
    super::tools::start_native_capture(app.clone(), kind.into())?;
    let state = super::tools::native_capture_status(app.clone())?;
    Ok(
        json!({"state":"awaiting_user","kind":kind,"operationId":state["id"],"message":"请在原生界面框选并完成操作；当前仅提交了打开界面的请求，尚未完成截图或开始录屏"}),
    )
}
fn pause_recording(app: &AppHandle, args: Value) -> Result<Value, String> {
    pause(app, args, true)
}
fn resume_recording(app: &AppHandle, args: Value) -> Result<Value, String> {
    pause(app, args, false)
}
fn pause(app: &AppHandle, args: Value, paused: bool) -> Result<Value, String> {
    let _: EmptyArgs = parse(args)?;
    if !super::tools::recording_active(app) {
        return Err("当前没有正在进行的录屏".into());
    }
    let status = super::tools::pause_screen_recording(app.clone(), paused)?;
    #[cfg(windows)]
    super::native_capture_service::post(
        app,
        super::native_capture_service::Message::Recording(status.clone()),
    );
    Ok(json!({"active":status.active,"paused":status.paused}))
}
fn stop_recording(app: &AppHandle, args: Value) -> Result<Value, String> {
    let _: EmptyArgs = parse(args)?;
    if !super::tools::recording_active(app) {
        return Err("当前没有正在进行的录屏".into());
    }
    let status = match super::tools::stop_recording(app) {
        Ok(status) => status,
        Err(error) => {
            #[cfg(windows)]
            super::native_capture_service::post(
                app,
                super::native_capture_service::Message::Failure(error.clone()),
            );
            return Err(error);
        }
    };
    #[cfg(windows)]
    super::native_capture_service::post(
        app,
        super::native_capture_service::Message::Recording(status.clone()),
    );
    Ok(
        json!({"active":status.active,"state":"draft_ready","message":"录屏已停止并完成封装，请在录屏页预览并选择保存位置"}),
    )
}
fn recording_status(app: &AppHandle, args: Value) -> Result<Value, String> {
    let _: EmptyArgs = parse(args)?;
    let status = super::tools::recording_snapshot(app)?;
    Ok(json!({"active":status.active,"paused":status.paused}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capture_replay_checks_current_session_instead_of_waiting_for_an_ended_picker() {
        let result = Outcome {
            ok: true,
            reused: true,
            error: None,
            data: json!({"state":"awaiting_user","operationId":"capture-1","kind":"recording"}),
        };
        assert_eq!(
            reconcile_capture(result.clone(), Some("capture-1"), false).data["state"],
            "awaiting_user"
        );
        assert_eq!(
            reconcile_capture(result.clone(), Some("capture-1"), true).data["state"],
            "recording"
        );
        for active in [None, Some("another-session")] {
            let ended = reconcile_capture(result.clone(), active, false);
            assert!(!ended.ok);
            assert_eq!(ended.data["state"], "unconfirmed");
        }
    }
    #[test]
    fn clearing_a_conversation_removes_only_its_execution_records() {
        let mut conn = Connection::open_in_memory().unwrap();
        clear_history(&conn, Some("one")).unwrap();
        for scope in ["one:turn", "one-extra:turn"] {
            execute_once(
                &mut conn,
                scope,
                "assistant_create_todo",
                &json!({"text":"test"}),
                || Ok(json!({"id":1})),
            )
            .unwrap();
        }
        clear_history(&conn, Some("one")).unwrap();
        let scopes: Vec<String> = conn
            .prepare("SELECT scope FROM ai_tool_runs")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(scopes, vec!["one-extra:turn"]);
        clear_history(&conn, None).unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM ai_tool_runs", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn registry_filters_hidden_and_platform_tools_and_has_unique_names() {
        let all = definitions_for(&json!({}), true);
        assert_eq!(all.len(), 9);
        let names: std::collections::HashSet<_> = all
            .iter()
            .map(|v| v["function"]["name"].as_str().unwrap())
            .collect();
        assert_eq!(names.len(), 9);
        assert_eq!(definitions_for(&json!({}), false).len(), 3);
        assert!(definitions_for(&json!({"aiChat":false}), true).is_empty());
        assert!(!definitions_for(&json!({"todo":false}), true)
            .iter()
            .any(|v| v["function"]["name"] == "assistant_create_todo"));
        assert_eq!(
            definitions_for(&json!({"timer":true,"reminder":false}), false).len(),
            3
        );
    }
    #[test]
    fn strict_arguments_and_time_ranges_reject_unintended_inputs() {
        assert!(parse::<TodoArgs>(json!({"text":"x","command":"bad"})).is_err());
        assert!(parse::<EmptyArgs>(json!({"path":"not allowed"})).is_err());
        for args in [
            json!({"title":"x"}),
            json!({"title":"x","delay_seconds":0}),
            json!({"title":"x","delay_seconds":1,"due_at_ms":2000}),
            json!({"title":"x","due_at_ms":999}),
        ] {
            assert!(reminder_time(&parse(args).unwrap(), 1000).is_err());
        }
        assert_eq!(
            reminder_time(
                &parse(json!({"title":"x","delay_seconds":10})).unwrap(),
                1000
            )
            .unwrap(),
            ("timer", 10000, 11000)
        );
    }
    #[test]
    fn retry_reuses_result_and_uncertain_reservation_never_repeats_effect() {
        let mut conn = Connection::open_in_memory().unwrap();
        let args = json!({"text":"one"});
        let mut calls = 0;
        let first = execute_once(&mut conn, "s:u", "assistant_create_todo", &args, || {
            calls += 1;
            Ok(json!({"id":7}))
        })
        .unwrap();
        assert!(first.ok);
        let again = execute_once(&mut conn, "s:u", "assistant_create_todo", &args, || {
            calls += 1;
            Ok(Value::Null)
        })
        .unwrap();
        assert!(again.reused);
        assert_eq!(calls, 1);
        assert_eq!(again.data["id"], 7);
        conn.execute("INSERT INTO ai_tool_runs(scope,name,args) VALUES('s:crashed','assistant_create_todo',?1)",[args.to_string()]).unwrap();
        let unknown = execute_once(
            &mut conn,
            "s:crashed",
            "assistant_create_todo",
            &args,
            || panic!("must not execute twice"),
        )
        .unwrap();
        assert!(!unknown.ok);
        assert!(unknown.reused);
        assert!(
            execute_once(&mut conn, "s:new", "assistant_create_todo", &args, || Ok(
                Value::Null
            ))
            .unwrap()
            .ok
        );
    }
}
