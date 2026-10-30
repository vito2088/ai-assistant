use super::*;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub fn path(raw: &str) -> Result<&str, String> {
    if raw.is_empty() || raw.len() > 4096 || raw.contains(['\0', '\r', '\n']) {
        return Err("远程路径无效".into());
    }
    Ok(raw)
}
pub fn safe_name(raw: &str) -> Result<&str, String> {
    if raw.is_empty()
        || raw == "."
        || raw == ".."
        || raw.len() > 255
        || raw.contains(['/', '\\', '\0', '\r', '\n'])
    {
        return Err("文件名称无效".into());
    }
    Ok(raw)
}
pub fn join(dir: &str, name: &str) -> String {
    format!("{}/{}", dir.trim_end_matches('/'), name)
}
pub async fn action(
    s: &Session,
    operation: &str,
    raw: &str,
    target: Option<&str>,
) -> Result<Value, String> {
    let raw = path(raw)?;
    let remote = s.remote()?;
    let sftp = remote.sftp().await?;
    match operation {
        "list" => {
            let canonical = sftp.canonicalize(raw).await.map_err(|_| "无法打开此目录")?;
            let mut entries = Vec::new();
            for entry in sftp
                .read_dir(canonical.clone())
                .await
                .map_err(|_| "无法读取远程目录")?
                .take(2001)
            {
                let name = entry.file_name();
                if name == "." || name == ".." {
                    continue;
                }
                let metadata = entry.metadata();
                entries.push(json!({"name":name,"path":join(&canonical,&name),"directory":metadata.is_dir(),"symlink":metadata.is_symlink(),"size":metadata.size.unwrap_or(0),"modified":metadata.mtime}));
            }
            let truncated = entries.len() > 2000;
            entries.truncate(2000);
            entries.sort_by(|a, b| {
                b["directory"]
                    .as_bool()
                    .cmp(&a["directory"].as_bool())
                    .then(a["name"].as_str().cmp(&b["name"].as_str()))
            });
            Ok(json!({"path":canonical,"entries":entries,"truncated":truncated}))
        }
        "read" => {
            let mut file = sftp.open(raw).await.map_err(|_| "无法打开远程文件")?;
            let mut data = vec![];
            (&mut file)
                .take(256 * 1024 + 1)
                .read_to_end(&mut data)
                .await
                .map_err(|_| "读取远程文件失败")?;
            let _ = file.shutdown().await;
            if data.len() > 256 * 1024 {
                return Err("预览仅支持 256 KB 以内的文本，请下载后查看".into());
            }
            let text =
                String::from_utf8(data).map_err(|_| "此文件不是 UTF-8 文本，请下载后查看")?;
            if text.contains('\0') {
                return Err("二进制文件不支持文本预览".into());
            }
            Ok(json!({"path":raw,"text":text}))
        }
        "mkdir" => {
            let name = safe_name(target.ok_or("请输入目录名")?)?;
            sftp.create_dir(join(raw, name))
                .await
                .map_err(|_| "创建远程目录失败")?;
            Ok(json!({"ok":true}))
        }
        "rename" => {
            let name = safe_name(target.ok_or("请输入新名称")?)?;
            let dir = raw
                .rsplit_once('/')
                .map(|(dir, _)| if dir.is_empty() { "/" } else { dir })
                .unwrap_or(".");
            let target = join(dir, name);
            if sftp
                .try_exists(target.clone())
                .await
                .map_err(|_| "无法检查目标名称")?
            {
                return Err("目标已存在，请使用其他名称".into());
            }
            sftp.rename(raw, target).await.map_err(|_| "重命名失败")?;
            Ok(json!({"ok":true}))
        }
        "remove" => {
            if raw == "/" || raw == "." || raw.ends_with("/..") {
                return Err("不能删除此目录".into());
            }
            let metadata = sftp
                .symlink_metadata(raw)
                .await
                .map_err(|_| "无法检查远程文件")?;
            if metadata.is_dir() && !metadata.is_symlink() {
                sftp.remove_dir(raw)
                    .await
                    .map_err(|_| "删除目录失败，目录必须为空")?;
            } else {
                sftp.remove_file(raw)
                    .await
                    .map_err(|_| "删除远程文件失败")?;
            }
            Ok(json!({"ok":true}))
        }
        _ => Err("未知的文件操作".into()),
    }
}
#[tauri::command]
pub async fn terminal_file_action(
    window: WebviewWindow,
    id: String,
    operation: String,
    path: String,
    target: Option<String>,
) -> Result<Value, String> {
    main_only(&window)?;
    let s = session(&id)?;
    tokio::time::timeout(
        Duration::from_secs(40),
        action(&s, &operation, &path, target.as_deref()),
    )
    .await
    .map_err(|_| "远程文件操作超时")?
}
struct Transfer {
    session: String,
    cancelled: AtomicBool,
}
fn transfers() -> &'static Mutex<HashMap<String, Arc<Transfer>>> {
    static TRANSFERS: OnceLock<Mutex<HashMap<String, Arc<Transfer>>>> = OnceLock::new();
    TRANSFERS.get_or_init(|| Mutex::new(HashMap::new()))
}
#[tauri::command]
pub fn terminal_cancel_transfer(window: WebviewWindow, id: String) -> Result<(), String> {
    main_only(&window)?;
    if let Some(t) = transfers().lock().map_err(|_| "传输状态不可用")?.get(&id) {
        t.cancelled.store(true, Ordering::Relaxed);
    }
    Ok(())
}
pub fn cancel_session(id: &str) {
    if let Ok(items) = transfers().lock() {
        for t in items.values().filter(|t| t.session == id) {
            t.cancelled.store(true, Ordering::Relaxed);
        }
    }
}
fn check(s: &Session, t: &Transfer) -> Result<(), String> {
    if s.closed.load(Ordering::Relaxed) || t.cancelled.load(Ordering::Relaxed) {
        Err("传输已取消".into())
    } else {
        Ok(())
    }
}
#[tauri::command]
pub async fn terminal_transfer(
    window: WebviewWindow,
    id: String,
    transfer_id: String,
    direction: String,
    local: String,
    remote: String,
    overwrite: bool,
    on_event: Channel<Value>,
) -> Result<(), String> {
    main_only(&window)?;
    let s = session(&id)?;
    if !valid_id(&transfer_id)
        || !["upload", "download"].contains(&direction.as_str())
        || !std::path::Path::new(&local).is_absolute()
    {
        return Err("传输参数无效".into());
    }
    path(&remote)?;
    let transfer = Arc::new(Transfer {
        session: id,
        cancelled: AtomicBool::new(false),
    });
    {
        let mut active = transfers().lock().map_err(|_| "传输状态不可用")?;
        if active.len() >= 4 || active.contains_key(&transfer_id) {
            return Err("最多同时传输 4 个文件".into());
        }
        active.insert(transfer_id.clone(), transfer.clone());
    }
    let result = transfer_file(
        &s,
        &transfer,
        &transfer_id,
        &direction,
        &local,
        &remote,
        overwrite,
        &on_event,
    )
    .await;
    transfers()
        .lock()
        .map_err(|_| "传输状态不可用")?
        .remove(&transfer_id);
    let _ =
        on_event.send(json!({"type":"finished","ok":result.is_ok(),"error":result.as_ref().err()}));
    result
}
async fn transfer_file(
    s: &Session,
    t: &Transfer,
    transfer_id: &str,
    direction: &str,
    local: &str,
    remote_path: &str,
    overwrite: bool,
    event: &Channel<Value>,
) -> Result<(), String> {
    let remote = s.remote()?;
    let sftp = remote.sftp().await?;
    check(s, t)?;
    let mut buffer = vec![0u8; 128 * 1024];
    let mut done = 0u64;
    let started = std::time::Instant::now();
    let mut last = started;
    if direction == "upload" {
        let mut input = tokio::fs::File::open(local)
            .await
            .map_err(|_| "无法打开上传文件")?;
        let meta = input.metadata().await.map_err(|_| "无法读取文件信息")?;
        if !meta.is_file() {
            return Err("请选择普通文件，文件夹请逐个上传".into());
        }
        let total = meta.len();
        let exists = sftp
            .try_exists(remote_path)
            .await
            .map_err(|_| "无法检查远程文件")?;
        if exists && !overwrite {
            return Err("远程文件已存在，请确认覆盖后重试".into());
        }
        let temporary = format!("{remote_path}.assistant-{transfer_id}.part");
        let mut output = sftp
            .open_with_flags(
                temporary.clone(),
                russh_sftp::protocol::OpenFlags::CREATE
                    | russh_sftp::protocol::OpenFlags::EXCLUDE
                    | russh_sftp::protocol::OpenFlags::WRITE,
            )
            .await
            .map_err(|_| "无法创建远程临时文件")?;
        let result = async {
            loop { check(s,t)?; let n = input.read(&mut buffer).await.map_err(|_| "读取本地文件失败")?; if n==0 { break; } output.write_all(&buffer[..n]).await.map_err(|_| "上传失败")?; done+=n as u64;
                if last.elapsed() >= Duration::from_millis(120) { event.send(json!({"type":"progress","done":done,"total":total,"speed":done as f64/started.elapsed().as_secs_f64().max(0.001)})).map_err(|_| "传输界面已断开")?; last=std::time::Instant::now(); }
            }
            output.shutdown().await.map_err(|_| "远程文件关闭失败")?; check(s,t)?;
            // SFTP v3 rename does not guarantee overwrite. Preserve the old file until the upload has finished.
            let backup = format!("{remote_path}.assistant-{transfer_id}.backup");
            let current_exists = sftp.try_exists(remote_path).await.map_err(|_| "无法检查远程目标")?;
            if current_exists && !overwrite { return Err("上传期间目标文件已出现，未覆盖".into()); }
            if current_exists { sftp.rename(remote_path,backup.clone()).await.map_err(|_| "无法备份待覆盖文件")?; }
            if sftp.rename(temporary.clone(),remote_path).await.is_err() { if current_exists { let _ = sftp.rename(backup.clone(),remote_path).await; } return Err("上传已完成但替换失败，请检查服务器上的临时文件与备份".into()); }
            if current_exists { let _ = sftp.remove_file(backup).await; }
            let _ = event.send(json!({"type":"progress","done":done,"total":total})); Ok(())
        }.await;
        if result.is_err() {
            let _ = output.shutdown().await;
            let _ = sftp.remove_file(temporary).await;
        }
        result
    } else {
        let destination = std::path::Path::new(local);
        let parent = destination.parent().ok_or("请选择有效的保存目录")?;
        let temporary =
            tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法创建本地临时文件")?;
        let mut output =
            tokio::fs::File::from_std(temporary.reopen().map_err(|_| "无法写入临时文件")?);
        let mut input = sftp
            .open(remote_path)
            .await
            .map_err(|_| "无法打开远程文件")?;
        let total = input
            .metadata()
            .await
            .map_err(|_| "无法读取远程文件信息")?
            .size
            .unwrap_or(0);
        let result = async {
            loop { check(s,t)?; let n = input.read(&mut buffer).await.map_err(|_| "下载失败")?; if n==0 { break; } output.write_all(&buffer[..n]).await.map_err(|_| "写入本地文件失败")?; done+=n as u64;
                if last.elapsed() >= Duration::from_millis(120) { event.send(json!({"type":"progress","done":done,"total":total,"speed":done as f64/started.elapsed().as_secs_f64().max(0.001)})).map_err(|_| "传输界面已断开")?; last=std::time::Instant::now(); }
            }
            output.flush().await.map_err(|_| "保存下载文件失败")?; output.sync_all().await.map_err(|_| "同步下载文件失败")?; check(s,t)?; Ok::<_,String>(())
        }.await;
        drop(output);
        let _ = input.shutdown().await;
        result?;
        if overwrite {
            temporary
                .persist(destination)
                .map_err(|_| "替换本地文件失败")?;
        } else {
            temporary
                .persist_noclobber(destination)
                .map_err(|_| "本地文件已存在，未覆盖")?;
        }
        let _ = event.send(json!({"type":"progress","done":done,"total":total}));
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn file_names_cannot_escape_the_selected_directory() {
        for value in ["..", "../a", "a/b", "a\\b", "a\nb", ""] {
            assert!(safe_name(value).is_err());
        }
        assert_eq!(join("/var/", "a.txt"), "/var/a.txt");
        assert_eq!(join("/", "a.txt"), "/a.txt");
    }
    #[tokio::test]
    async fn sftp_lists_previews_and_roundtrips_files_without_partial_destinations() {
        tokio::time::timeout(Duration::from_secs(30), async {
            let fixture = super::super::test_server::start().await;
            let s = &fixture.session;
            let listed = action(s, "list", ".", None).await.unwrap();
            assert_eq!(listed["path"], "/");
            assert_eq!(listed["entries"][0]["name"], "hello.txt");
            assert_eq!(
                action(s, "read", "/hello.txt", None).await.unwrap()["text"],
                "hello over SFTP"
            );
            let dir = tempfile::tempdir().unwrap();
            let input = dir.path().join("input.bin");
            let output = dir.path().join("output.bin");
            let bytes = (0..600_000).map(|i| (i % 251) as u8).collect::<Vec<_>>();
            std::fs::write(&input, &bytes).unwrap();
            let t = Transfer {
                session: s.id.clone(),
                cancelled: AtomicBool::new(false),
            };
            let event = Channel::new(|_| Ok(()));
            transfer_file(
                s,
                &t,
                "roundtrip",
                "upload",
                input.to_str().unwrap(),
                "/uploaded.bin",
                false,
                &event,
            )
            .await
            .unwrap();
            assert_eq!(fixture.files.lock().unwrap().files["/uploaded.bin"], bytes);
            assert!(!fixture
                .files
                .lock()
                .unwrap()
                .files
                .keys()
                .any(|p| p.ends_with(".part")));
            assert!(transfer_file(
                s,
                &t,
                "no-overwrite",
                "upload",
                input.to_str().unwrap(),
                "/uploaded.bin",
                false,
                &event
            )
            .await
            .is_err());
            std::fs::write(&input, b"replacement").unwrap();
            transfer_file(
                s,
                &t,
                "overwrite",
                "upload",
                input.to_str().unwrap(),
                "/uploaded.bin",
                true,
                &event,
            )
            .await
            .unwrap();
            transfer_file(
                s,
                &t,
                "download",
                "download",
                output.to_str().unwrap(),
                "/uploaded.bin",
                false,
                &event,
            )
            .await
            .unwrap();
            assert_eq!(std::fs::read(&output).unwrap(), b"replacement");
            t.cancelled.store(true, Ordering::Relaxed);
            assert!(transfer_file(
                s,
                &t,
                "cancelled",
                "upload",
                input.to_str().unwrap(),
                "/cancelled.bin",
                false,
                &event
            )
            .await
            .is_err());
            assert!(!fixture
                .files
                .lock()
                .unwrap()
                .files
                .contains_key("/cancelled.bin"));
            close(s.clone()).await;
        })
        .await
        .expect("loopback SSH/SFTP test timed out");
    }
}
