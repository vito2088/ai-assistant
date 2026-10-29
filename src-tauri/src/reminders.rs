use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task { id: i64, kind: String, title: String, due_at: i64, remaining: i64, state: String, screen: bool }

fn initialize(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS timed_tasks (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, due_at INTEGER NOT NULL, remaining INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'running', screen INTEGER NOT NULL DEFAULT 1);
      CREATE INDEX IF NOT EXISTS timed_tasks_due ON timed_tasks(state,due_at);").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn timed_tasks(app: AppHandle) -> Result<Vec<Task>, String> {
    let conn = super::db(&app)?;
    let mut stmt = conn.prepare("SELECT id,kind,title,due_at,remaining,state,screen FROM timed_tasks ORDER BY CASE state WHEN 'done' THEN 0 WHEN 'running' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,due_at,id").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(Task { id:r.get(0)?,kind:r.get(1)?,title:r.get(2)?,due_at:r.get(3)?,remaining:r.get(4)?,state:r.get(5)?,screen:r.get(6)? })).map_err(|e|e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())
}

#[tauri::command]
pub fn add_timed_task(app: AppHandle, kind: String, title: String, value: i64, screen: bool) -> Result<(), String> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 200 { return Err("请输入 1～200 字的提醒内容".into()); }
    let now = super::now_ms();
    let due = if kind == "timer" {
        if !(1000..=31_536_000_000).contains(&value) { return Err("倒计时须在 1 秒到 365 天之间".into()); }
        now + value
    } else if kind == "reminder" {
        if value <= now || value > now + 315_360_000_000 { return Err("请选择未来十年内的提醒时间".into()); }
        value
    } else { return Err("未知定时任务类型".into()); };
    super::db(&app)?.execute("INSERT INTO timed_tasks(kind,title,due_at,screen) VALUES(?1,?2,?3,?4)",params![kind,title,due,screen]).map_err(|e|e.to_string())?;
    app.emit("timed-tasks-changed",()).map_err(|e|e.to_string())
}

fn change(conn: &Connection, id: i64, action: &str, now: i64) -> Result<(), String> {
    let sql = match action {
        "pause" => "UPDATE timed_tasks SET remaining=MAX(1,due_at-?2),state='paused' WHERE id=?1 AND state='running' AND kind='timer' AND due_at>?2",
        "resume" => "UPDATE timed_tasks SET due_at=?2+remaining,remaining=0,state='running' WHERE id=?1 AND state='paused'",
        "snooze" => "UPDATE timed_tasks SET due_at=?2+300000,state='running',remaining=0 WHERE id=?1 AND state='done'",
        "dismiss" => "UPDATE timed_tasks SET state='dismissed' WHERE id=?1 AND state='done' AND ?2>=0",
        "delete" => "DELETE FROM timed_tasks WHERE id=?1 AND ?2>=0",
        _ => return Err("未知任务操作".into()),
    };
    conn.execute(sql,params![id,now]).map_err(|e|e.to_string())?;
    Ok(())
}

fn update(conn: &mut Connection, id: i64, kind: &str, title: &str, value: i64, screen: bool, reset_time: bool, now: i64) -> Result<(), String> {
    let title=title.trim();
    if title.is_empty() || title.chars().count()>200 { return Err("请输入 1～200 字的提醒内容".into()); }
    if !["timer","reminder"].contains(&kind) { return Err("未知定时任务类型".into()); }
    let tx=conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e|e.to_string())?;
    let old:Option<(String,String)>=tx.query_row("SELECT kind,state FROM timed_tasks WHERE id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
    let (old_kind,state)=old.ok_or("提醒已被删除，请刷新列表")?;
    if reset_time || kind!=old_kind {
        let due=if kind=="timer" {
            if !(1000..=31_536_000_000).contains(&value) { return Err("倒计时须在 1 秒到 365 天之间".into()); }
            now+value
        } else {
            if value<=now || value>now+315_360_000_000 { return Err("请选择未来十年内的提醒时间".into()); }
            value
        };
        let paused=kind=="timer" && old_kind=="timer" && state=="paused";
        tx.execute("UPDATE timed_tasks SET kind=?2,title=?3,due_at=?4,remaining=?5,state=?6,screen=?7 WHERE id=?1",params![id,kind,title,due,if paused {value}else{0},if paused {"paused"}else{"running"},screen]).map_err(|e|e.to_string())?;
    } else {
        tx.execute("UPDATE timed_tasks SET title=?2,screen=?3 WHERE id=?1",params![id,title,screen]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e|e.to_string())
}

#[tauri::command]
pub fn update_timed_task(app: AppHandle, id: i64, kind: String, title: String, value: i64, screen: bool, reset_time: bool) -> Result<(),String> {
    update(&mut super::db(&app)?,id,&kind,&title,value,screen,reset_time,super::now_ms())?;
    app.emit("timed-tasks-changed",()).map_err(|e|e.to_string())
}

#[tauri::command]
pub fn change_timed_task(app: AppHandle, id: i64, action: String) -> Result<(), String> {
    change(&super::db(&app)?,id,&action,super::now_ms())?;
    app.emit("timed-tasks-changed",()).map_err(|e|e.to_string())
}

fn tick(conn: &Connection, now: i64) -> Result<bool, String> {
    conn.execute("UPDATE timed_tasks SET state='done' WHERE state='running' AND due_at<=?1",[now]).map(|n|n>0).map_err(|e|e.to_string())
}

pub fn start(app: AppHandle) -> Result<(), String> {
    initialize(&super::db(&app)?)?;
    std::thread::spawn(move || loop {
        let result = (|| -> Result<(),String> {
            let conn = super::db(&app)?;
            if tick(&conn,super::now_ms())? { let _ = app.emit("timed-tasks-changed",()); }
            let pending: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM timed_tasks WHERE state='done' AND screen=1)",[],|r|r.get(0)).map_err(|e|e.to_string())?;
            if pending && app.get_webview_window("reminder-alert").is_none() {
                let handle = app.clone();
                app.run_on_main_thread(move || {
                    if handle.get_webview_window("reminder-alert").is_some() { return; }
                    let result = (|| -> Result<(),String> {
                        let monitor = handle.primary_monitor().map_err(|e|e.to_string())?.ok_or("没有可用显示器")?;
                        let scale = monitor.scale_factor();
                        WebviewWindowBuilder::new(&handle,"reminder-alert",WebviewUrl::App("reminder.html".into()))
                            .title("小助手 · 提醒").transparent(true).decorations(false).shadow(false).resizable(false)
                            .skip_taskbar(true).always_on_top(true).focused(false).visible(false)
                            .position((monitor.position().x as f64 + (monitor.size().width as f64 - (720.0*scale).min(monitor.size().width as f64-24.0*scale))/2.0)/scale, monitor.position().y as f64/scale+92.0)
                            .inner_size(720.0_f64.min(monitor.size().width as f64/scale-24.0),if monitor.size().width as f64/scale<554.0 {104.0}else{88.0})
                            .build().map_err(|e|e.to_string())?;
                        Ok(())
                    })();
                    if let Err(error)=result { eprintln!("显示提醒失败：{error}"); }
                }).map_err(|e|e.to_string())?;
            }
            Ok(())
        })();
        if let Err(error)=result { eprintln!("检查提醒失败：{error}"); }
        std::thread::sleep(std::time::Duration::from_secs(1));
    });
    Ok(())
}

#[tauri::command]
pub async fn animate_reminder_alert(window: tauri::WebviewWindow, reduced_motion: bool) -> Result<(),String> {
    if window.label() != "reminder-alert" { return Err("无效提醒窗口".into()); }
    tauri::async_runtime::spawn_blocking(move || -> Result<(),String> {
        let destination=window.outer_position().map_err(|e|e.to_string())?;
        let monitor=window.current_monitor().map_err(|e|e.to_string())?.ok_or("没有可用显示器")?;
        if reduced_motion { return window.show().map_err(|e|e.to_string()); }
        let start=monitor.position().y-window.outer_size().map_err(|e|e.to_string())?.height as i32;
        window.set_position(tauri::PhysicalPosition::new(destination.x,start)).map_err(|e|e.to_string())?;
        window.show().map_err(|e|e.to_string())?;
        for step in 1..=28 {
            let progress=step as f64/28.0;
            let eased=1.0-(1.0-progress).powi(3);
            let y=start+((destination.y-start) as f64*eased).round() as i32;
            window.set_position(tauri::PhysicalPosition::new(destination.x,y)).map_err(|e|e.to_string())?;
            std::thread::sleep(std::time::Duration::from_millis(16));
        }
        Ok(())
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub fn close_reminder_alert(window: tauri::WebviewWindow) -> Result<(),String> {
    if window.label() != "reminder-alert" { return Err("无效提醒窗口".into()); }
    window.destroy().map_err(|e|e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn edit_preserves_identity_deadline_and_pause_until_time_is_changed() {
        let mut conn=Connection::open_in_memory().unwrap();initialize(&conn).unwrap();
        conn.execute("INSERT INTO timed_tasks(id,kind,title,due_at) VALUES(1,'timer','original',10000)",[]).unwrap();
        update(&mut conn,1,"timer","renamed",9000,false,false,5000).unwrap();
        let (due,title,screen):(i64,String,bool)=conn.query_row("SELECT due_at,title,screen FROM timed_tasks WHERE id=1",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
        assert_eq!((due,title,screen),(10000,"renamed".into(),false));
        change(&conn,1,"pause",6000).unwrap();
        update(&mut conn,1,"timer","paused edit",20000,true,true,7000).unwrap();
        let (state,left):(String,i64)=conn.query_row("SELECT state,remaining FROM timed_tasks WHERE id=1",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
        assert_eq!((state,left),("paused".into(),20000));
        assert!(!tick(&conn,50000).unwrap());
        change(&conn,1,"resume",50000).unwrap();assert!(tick(&conn,70000).unwrap());
        update(&mut conn,1,"reminder","rescheduled",90000,true,true,71000).unwrap();
        assert!(!tick(&conn,89999).unwrap());assert!(tick(&conn,90000).unwrap());
        assert!(update(&mut conn,1,"reminder","invalid",100,true,true,91000).is_err());
        change(&conn,1,"delete",92000).unwrap();
        assert!(update(&mut conn,1,"timer","deleted",10000,true,true,93000).is_err());
        let count:i64=conn.query_row("SELECT COUNT(*) FROM timed_tasks",[],|r|r.get(0)).unwrap();assert_eq!(count,0);
    }
    #[test]
    fn deadlines_pause_resume_snooze_and_acknowledgement() {
        let conn=Connection::open_in_memory().unwrap();initialize(&conn).unwrap();
        conn.execute("INSERT INTO timed_tasks(id,kind,title,due_at) VALUES(1,'timer','test',10000)",[]).unwrap();
        change(&conn,1,"pause",4000).unwrap();
        assert!(!tick(&conn,20000).unwrap());
        change(&conn,1,"resume",20000).unwrap();
        assert!(!tick(&conn,25999).unwrap());assert!(tick(&conn,26000).unwrap());assert!(!tick(&conn,27000).unwrap());
        change(&conn,1,"snooze",27000).unwrap();assert!(!tick(&conn,326999).unwrap());assert!(tick(&conn,327000).unwrap());
        change(&conn,1,"dismiss",328000).unwrap();assert!(!tick(&conn,900000).unwrap());
        let state:String=conn.query_row("SELECT state FROM timed_tasks WHERE id=1",[],|r|r.get(0)).unwrap();assert_eq!(state,"dismissed");
    }
    #[test]
    fn overdue_tasks_are_recovered_in_one_batch() {
        let conn=Connection::open_in_memory().unwrap();initialize(&conn).unwrap();
        conn.execute_batch("INSERT INTO timed_tasks(kind,title,due_at,screen) VALUES('reminder','first',100,1),('reminder','second',200,0);").unwrap();
        assert!(tick(&conn,10000).unwrap());assert!(!tick(&conn,10001).unwrap());
        let count:i64=conn.query_row("SELECT COUNT(*) FROM timed_tasks WHERE state='done'",[],|r|r.get(0)).unwrap();assert_eq!(count,2);
    }
}
