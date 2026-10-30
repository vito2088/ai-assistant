use super::*;
use rusqlite::OptionalExtension;
use russh::{
    client,
    keys::{HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate},
    ChannelMsg,
};
use russh_sftp::client::SftpSession;
use tokio::sync::{Mutex as AsyncMutex, OnceCell};

pub struct Verifier {
    pub(super) expected: Option<String>,
    pub(super) observed: Arc<Mutex<Option<String>>>,
}
impl client::Handler for Verifier {
    type Error = russh::Error;
    async fn check_server_key(
        &mut self,
        key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let fingerprint = key.public_key().fingerprint(HashAlg::Sha256).to_string();
        if let Ok(mut observed) = self.observed.lock() {
            *observed = Some(fingerprint.clone());
        }
        Ok(self.expected.as_deref() == Some(&fingerprint))
    }
}
pub struct Remote {
    pub handle: client::Handle<Verifier>,
    pub writer: AsyncMutex<russh::ChannelWriteHalf<client::Msg>>,
    pub(super) sftp: OnceCell<SftpSession>,
}
impl Remote {
    pub async fn sftp(&self) -> Result<&SftpSession, String> {
        self.sftp
            .get_or_try_init(|| async {
                let mut channel = self
                    .handle
                    .channel_open_session()
                    .await
                    .map_err(|_| "无法打开文件通道")?;
                channel
                    .request_subsystem(true, "sftp")
                    .await
                    .map_err(|_| "服务器不支持 SFTP")?;
                acknowledge(&mut channel)
                    .await
                    .map_err(|_| "服务器拒绝 SFTP 通道")?;
                let sftp = SftpSession::new(channel.into_stream())
                    .await
                    .map_err(|_| "SFTP 初始化失败")?;
                sftp.set_timeout(30);
                Ok(sftp)
            })
            .await
    }
}
async fn acknowledge(channel: &mut russh::Channel<client::Msg>) -> Result<Vec<Vec<u8>>, String> {
    tokio::time::timeout(Duration::from_secs(10), async {
        let mut buffered = Vec::new();
        let mut total = 0;
        loop {
            match channel.wait().await {
                Some(ChannelMsg::Success) => return Ok(buffered),
                Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                    total += data.len();
                    if total > 65536 {
                        return Err("服务器启动输出过多".into());
                    }
                    buffered.push(data.to_vec());
                }
                Some(ChannelMsg::Failure) | Some(ChannelMsg::Close) | None => {
                    return Err("服务器拒绝了终端请求".into())
                }
                _ => (),
            }
        }
    })
    .await
    .map_err(|_| "等待服务器启动终端超时")?
}
pub(super) fn config() -> Arc<client::Config> {
    Arc::new(client::Config {
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        ..Default::default()
    })
}
pub fn trusted(app: &AppHandle, p: &Profile) -> Result<Option<String>, String> {
    database(app)?
        .query_row(
            "SELECT fingerprint FROM terminal_hosts WHERE host=?1 AND port=?2",
            params![p.host, p.port],
            |r| r.get(0),
        )
        .optional()
        .map_err(|_| "读取主机信任记录失败".into())
}
#[tauri::command]
pub async fn terminal_probe_host(
    app: AppHandle,
    window: WebviewWindow,
    profile_id: String,
) -> Result<Value, String> {
    main_only(&window)?;
    let p = profile(&app, &profile_id)?;
    validate_profile(&p)?;
    if p.kind != "ssh" {
        return Err("请选择 SSH 连接".into());
    }
    let known = trusted(&app, &p)?;
    let observed = Arc::new(Mutex::new(None));
    // Deliberately reject the handshake. No authentication secret is used in a probe.
    let result = tokio::time::timeout(
        Duration::from_secs(20),
        client::connect(
            config(),
            (p.host.as_str(), p.port),
            Verifier {
                expected: None,
                observed: observed.clone(),
            },
        ),
    )
    .await;
    let fingerprint = observed
        .lock()
        .map_err(|_| "无法读取服务器指纹")?
        .clone()
        .ok_or(if result.is_err() {
            "连接超时，请检查地址与端口"
        } else {
            "无法取得服务器指纹，请检查网络与 SSH 服务"
        })?;
    Ok(
        json!({"fingerprint":fingerprint,"previous":known,"trusted":known.as_ref()==Some(&fingerprint),"changed":known.is_some() && known.as_ref()!=Some(&fingerprint)}),
    )
}
#[tauri::command]
pub fn terminal_trust_host(
    app: AppHandle,
    window: WebviewWindow,
    profile_id: String,
    fingerprint: String,
    previous: Option<String>,
) -> Result<(), String> {
    main_only(&window)?;
    let p = profile(&app, &profile_id)?;
    if p.kind != "ssh"
        || !fingerprint.starts_with("SHA256:")
        || fingerprint.len() > 100
        || fingerprint.contains(char::is_whitespace)
    {
        return Err("主机指纹无效".into());
    }
    let mut conn = database(&app)?;
    let tx = conn.transaction().map_err(|_| "无法更新主机记录")?;
    let current: Option<String> = tx
        .query_row(
            "SELECT fingerprint FROM terminal_hosts WHERE host=?1 AND port=?2",
            params![p.host, p.port],
            |r| r.get(0),
        )
        .optional()
        .map_err(|_| "无法读取主机记录")?;
    if current != previous {
        return Err("主机信任记录已变化，请重新核对".into());
    }
    tx.execute("INSERT INTO terminal_hosts(host,port,fingerprint) VALUES(?1,?2,?3) ON CONFLICT(host,port) DO UPDATE SET fingerprint=excluded.fingerprint", params![p.host,p.port,fingerprint]).map_err(|_| "保存主机信任记录失败")?;
    tx.commit().map_err(|_| "保存主机信任记录失败".into())
}
pub async fn open(
    app: &AppHandle,
    s: Arc<Session>,
    cols: u16,
    rows: u16,
    secret: Option<Zeroizing<String>>,
    remember: bool,
) -> Result<(), String> {
    let p = &s.profile;
    let expected = trusted(app, p)?.ok_or("请先核对并信任服务器指纹")?;
    let observed = Arc::new(Mutex::new(None));
    let mut handle = tokio::time::timeout(
        Duration::from_secs(20),
        client::connect(
            config(),
            (p.host.as_str(), p.port),
            Verifier {
                expected: Some(expected.clone()),
                observed: observed.clone(),
            },
        ),
    )
    .await
    .map_err(|_| "SSH 连接超时")?
    .map_err(|_| {
        if observed
            .lock()
            .ok()
            .and_then(|v| v.clone())
            .is_some_and(|v| v != expected)
        {
            "服务器指纹已变化，已阻止登录"
        } else {
            "SSH 连接失败，请检查网络与服务配置"
        }
    })?;
    if s.closed.load(Ordering::Relaxed) {
        return Err("连接已取消".into());
    }
    let id = p.id.clone();
    let secret = if let Some(secret) = secret {
        secret
    } else {
        tauri::async_runtime::spawn_blocking(move || match credential(&id)?.get_password() {
            Ok(value) => Ok(Zeroizing::new(value)),
            Err(keyring::Error::NoEntry) => Ok(Zeroizing::new(String::new())),
            Err(_) => Err("无法读取系统凭据，请重新输入或检查凭据库".to_string()),
        })
        .await
        .map_err(|_| "凭据读取任务失败")??
    };
    let auth = if p.auth == "password" {
        if secret.is_empty() {
            return Err("请输入 SSH 登录密码".into());
        }
        tokio::time::timeout(
            Duration::from_secs(20),
            handle.authenticate_password(&p.username, secret.as_str()),
        )
        .await
        .map_err(|_| "SSH 认证超时")?
        .map_err(|_| "SSH 密码认证失败")?
    } else {
        let path = p.key_path.clone();
        let pass = secret.clone();
        let key = tauri::async_runtime::spawn_blocking(move || {
            russh::keys::load_secret_key(
                path,
                if pass.is_empty() {
                    None
                } else {
                    Some(pass.as_str())
                },
            )
            .map_err(|_| "读取私钥失败，请检查文件与私钥口令")
        })
        .await
        .map_err(|_| "私钥读取任务失败")??;
        let hash = handle
            .best_supported_rsa_hash()
            .await
            .map_err(|_| "无法协商密钥算法")?
            .flatten();
        tokio::time::timeout(
            Duration::from_secs(20),
            handle.authenticate_publickey(
                &p.username,
                PrivateKeyWithHashAlg::new(Arc::new(key), hash),
            ),
        )
        .await
        .map_err(|_| "SSH 认证超时")?
        .map_err(|_| "SSH 密钥认证失败")?
    };
    if !auth.success() {
        return Err("认证被拒绝，请检查账号、密码或密钥；此版本暂不支持交互式 MFA".into());
    }
    if s.closed.load(Ordering::Relaxed) {
        let _ = handle
            .disconnect(russh::Disconnect::ByApplication, "", "")
            .await;
        return Err("连接已取消".into());
    }
    let mut channel = tokio::time::timeout(Duration::from_secs(20), handle.channel_open_session())
        .await
        .map_err(|_| "远程终端打开超时")?
        .map_err(|_| "无法打开远程终端")?;
    channel
        .request_pty(
            true,
            "xterm-256color",
            cols.clamp(10, 500).into(),
            rows.clamp(4, 200).into(),
            0,
            0,
            &[],
        )
        .await
        .map_err(|_| "服务器拒绝分配终端")?;
    let mut startup = acknowledge(&mut channel).await?;
    channel
        .request_shell(true)
        .await
        .map_err(|_| "服务器拒绝启动 Shell")?;
    startup.extend(acknowledge(&mut channel).await?);
    // POSIX remote shell in v0.1; quote the configured directory as data.
    if !p.cwd.is_empty() {
        channel
            .data_bytes(format!("cd -- {}\r", quote(&p.cwd)).into_bytes())
            .await
            .map_err(|_| "设置远程目录失败")?;
    }
    if remember && !secret.is_empty() {
        let id = p.id.clone();
        let secret = secret.clone();
        tauri::async_runtime::spawn_blocking(move || {
            credential(&id)?
                .set_password(secret.as_str())
                .map_err(|_| "连接成功，但无法保存系统凭据".to_string())
        })
        .await
        .map_err(|_| "凭据保存任务失败")??;
    }
    if !secret.is_empty() {
        s.secrets
            .lock()
            .map_err(|_| "凭据过滤器不可用")?
            .push(secret);
    }
    let (mut reader, writer) = channel.split();
    let remote = Arc::new(Remote {
        handle,
        writer: AsyncMutex::new(writer),
        sftp: OnceCell::new(),
    });
    {
        let mut backend = s.backend.lock().map_err(|_| "会话不可用")?;
        if s.closed.load(Ordering::Relaxed) {
            return Err("连接已取消".into());
        }
        *backend = Some(Backend::Ssh(remote.clone()));
    }
    for data in startup {
        s.output(&data)?;
    }
    tauri::async_runtime::spawn(async move {
        let mut code = None;
        while !s.closed.load(Ordering::Relaxed) {
            while s.pending.load(Ordering::Relaxed) > 256 * 1024
                && !s.closed.load(Ordering::Relaxed)
            {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            match reader.wait().await {
                Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                    if s.output(&data).is_err() {
                        break;
                    }
                }
                Some(ChannelMsg::ExitStatus { exit_status }) => code = Some(exit_status),
                Some(ChannelMsg::Close) | None => break,
                _ => (),
            }
        }
        s.finish(code, None);
        let _ = remote
            .handle
            .disconnect(russh::Disconnect::ByApplication, "", "")
            .await;
    });
    Ok(())
}
pub fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use russh::client::Handler;
    #[test]
    fn remote_directory_is_quoted_as_data() {
        assert_eq!(quote("/a'b;$(x)"), "'/a'\\''b;$(x)'");
    }
    #[tokio::test]
    async fn verifier_rejects_unknown_and_changed_keys() {
        let key =
            russh::keys::PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519)
                .unwrap();
        let key = PublicKeyOrCertificate::from(key.public_key().clone());
        let seen = Arc::new(Mutex::new(None));
        let mut verifier = Verifier {
            expected: None,
            observed: seen.clone(),
        };
        assert!(!verifier.check_server_key(&key).await.unwrap());
        verifier.expected = seen.lock().unwrap().clone();
        assert!(verifier.check_server_key(&key).await.unwrap());
        verifier.expected = Some("SHA256:changed".into());
        assert!(!verifier.check_server_key(&key).await.unwrap());
    }
    #[tokio::test]
    async fn changed_host_is_rejected_before_password_authentication() {
        let fixture = super::super::test_server::start().await;
        assert_eq!(fixture.auth_calls.load(Ordering::SeqCst), 1);
        let rejected = client::connect(
            config(),
            fixture.address,
            Verifier {
                expected: Some("SHA256:wrong".into()),
                observed: Arc::new(Mutex::new(None)),
            },
        )
        .await;
        assert!(rejected.is_err());
        assert_eq!(fixture.auth_calls.load(Ordering::SeqCst), 1);
        let mut accepted = client::connect(
            config(),
            fixture.address,
            Verifier {
                expected: Some(fixture.fingerprint.clone()),
                observed: Arc::new(Mutex::new(None)),
            },
        )
        .await
        .unwrap();
        assert!(!accepted
            .authenticate_password("fixture", "wrong-password")
            .await
            .unwrap()
            .success());
        assert!(accepted
            .authenticate_password("fixture", "fixture-pass")
            .await
            .unwrap()
            .success());
        let mut channel = accepted.channel_open_session().await.unwrap();
        channel
            .request_pty(true, "xterm", 80, 24, 0, 0, &[])
            .await
            .unwrap();
        acknowledge(&mut channel).await.unwrap();
        channel.request_shell(true).await.unwrap();
        acknowledge(&mut channel).await.unwrap();
        let _ = accepted
            .disconnect(russh::Disconnect::ByApplication, "", "")
            .await;
        close(fixture.session.clone()).await;
    }
}
