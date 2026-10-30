//! Loopback-only SSH/SFTP fixture; never uses saved hosts or user credentials.
use super::*;
use russh::{
    keys::{Algorithm, HashAlg, PrivateKey},
    server, Channel, ChannelId,
};
use russh_sftp::protocol::*;
use std::collections::HashSet;
use tokio::sync::OnceCell;

#[derive(Default)]
pub struct Files {
    pub files: HashMap<String, Vec<u8>>,
    dirs: HashSet<String>,
}
pub struct Fixture {
    pub session: Arc<Session>,
    pub files: Arc<Mutex<Files>>,
    pub auth_calls: Arc<AtomicUsize>,
    pub address: std::net::SocketAddr,
    pub fingerprint: String,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.task.abort();
    }
}
struct Handler {
    channels: HashMap<ChannelId, Channel<server::Msg>>,
    files: Arc<Mutex<Files>>,
    auth_calls: Arc<AtomicUsize>,
}
impl server::Handler for Handler {
    type Error = russh::Error;
    async fn auth_password(
        &mut self,
        user: &str,
        password: &str,
    ) -> Result<server::Auth, Self::Error> {
        self.auth_calls.fetch_add(1, Ordering::SeqCst);
        Ok(if user == "fixture" && password == "fixture-pass" {
            server::Auth::Accept
        } else {
            server::Auth::Reject {
                proceed_with_methods: None,
                partial_success: false,
            }
        })
    }
    async fn channel_open_session(
        &mut self,
        channel: Channel<server::Msg>,
        reply: server::ChannelOpenHandle,
        _session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        self.channels.insert(channel.id(), channel);
        reply.accept().await;
        Ok(())
    }
    async fn pty_request(
        &mut self,
        id: ChannelId,
        _term: &str,
        _w: u32,
        _h: u32,
        _pw: u32,
        _ph: u32,
        _modes: &[(russh::Pty, u32)],
        s: &mut server::Session,
    ) -> Result<(), Self::Error> {
        s.channel_success(id)?;
        Ok(())
    }
    async fn shell_request(
        &mut self,
        id: ChannelId,
        s: &mut server::Session,
    ) -> Result<(), Self::Error> {
        s.channel_success(id)?;
        s.data(id, b"fixture shell ready\r\n".to_vec())?;
        Ok(())
    }
    async fn exec_request(
        &mut self,
        id: ChannelId,
        _data: &[u8],
        s: &mut server::Session,
    ) -> Result<(), Self::Error> {
        s.channel_success(id)?;
        s.data(id, b"SSH_EXEC_OK\n".to_vec())?;
        s.exit_status_request(id, 0)?;
        s.eof(id)?;
        s.close(id)?;
        Ok(())
    }
    async fn subsystem_request(
        &mut self,
        id: ChannelId,
        name: &str,
        s: &mut server::Session,
    ) -> Result<(), Self::Error> {
        if name != "sftp" {
            s.channel_failure(id)?;
            return Ok(());
        }
        s.channel_success(id)?;
        let channel = self.channels.remove(&id).unwrap();
        let files = self.files.clone();
        tokio::spawn(async move {
            russh_sftp::server::run(
                channel.into_stream(),
                Sftp {
                    files,
                    handles: HashMap::new(),
                    read_dirs: HashSet::new(),
                },
            )
            .await;
        });
        Ok(())
    }
}
struct Sftp {
    files: Arc<Mutex<Files>>,
    handles: HashMap<String, String>,
    read_dirs: HashSet<String>,
}
fn ok(id: u32) -> Status {
    Status {
        id,
        status_code: StatusCode::Ok,
        error_message: String::new(),
        language_tag: String::new(),
    }
}
fn attrs(files: &Files, path: &str) -> Result<FileAttributes, StatusCode> {
    let mut a = FileAttributes::empty();
    if files.dirs.contains(path) {
        a.permissions = Some(0o040755);
    } else {
        a.size = Some(files.files.get(path).ok_or(StatusCode::NoSuchFile)?.len() as u64);
        a.permissions = Some(0o100644);
    }
    Ok(a)
}
impl russh_sftp::server::Handler for Sftp {
    type Error = StatusCode;
    fn unimplemented(&self) -> Self::Error {
        StatusCode::OpUnsupported
    }
    async fn init(
        &mut self,
        _version: u32,
        _extensions: HashMap<String, String>,
    ) -> Result<Version, Self::Error> {
        Ok(Version::new())
    }
    async fn realpath(&mut self, id: u32, path: String) -> Result<Name, Self::Error> {
        let path = if path == "." { "/".into() } else { path };
        Ok(Name {
            id,
            files: vec![File::dummy(path)],
        })
    }
    async fn stat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        Ok(Attrs {
            id,
            attrs: attrs(&self.files.lock().unwrap(), &path)?,
        })
    }
    async fn lstat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        self.stat(id, path).await
    }
    async fn fstat(&mut self, id: u32, handle: String) -> Result<Attrs, Self::Error> {
        self.stat(
            id,
            self.handles
                .get(&handle)
                .ok_or(StatusCode::Failure)?
                .clone(),
        )
        .await
    }
    async fn opendir(&mut self, id: u32, path: String) -> Result<Handle, Self::Error> {
        if !self.files.lock().unwrap().dirs.contains(&path) {
            return Err(StatusCode::NoSuchFile);
        }
        self.read_dirs.remove(&path);
        Ok(Handle { id, handle: path })
    }
    async fn readdir(&mut self, id: u32, handle: String) -> Result<Name, Self::Error> {
        if !self.read_dirs.insert(handle.clone()) {
            return Err(StatusCode::Eof);
        }
        let f = self.files.lock().unwrap();
        let prefix = format!("{}/", handle.trim_end_matches('/'));
        let files = f
            .files
            .keys()
            .filter_map(|path| {
                let name = path.strip_prefix(&prefix)?;
                if name.contains('/') {
                    return None;
                }
                Some(File::new(name, attrs(&f, path).unwrap()))
            })
            .collect();
        Ok(Name { id, files })
    }
    async fn open(
        &mut self,
        id: u32,
        filename: String,
        pflags: OpenFlags,
        _attrs: FileAttributes,
    ) -> Result<Handle, Self::Error> {
        let mut files = self.files.lock().unwrap();
        if pflags.contains(OpenFlags::EXCLUDE) && files.files.contains_key(&filename) {
            return Err(StatusCode::Failure);
        }
        if !files.files.contains_key(&filename) {
            if !pflags.contains(OpenFlags::CREATE) {
                return Err(StatusCode::NoSuchFile);
            }
            files.files.insert(filename.clone(), vec![]);
        }
        if pflags.contains(OpenFlags::TRUNCATE) {
            files.files.insert(filename.clone(), vec![]);
        }
        let handle = uuid::Uuid::new_v4().to_string();
        self.handles.insert(handle.clone(), filename);
        Ok(Handle { id, handle })
    }
    async fn close(&mut self, id: u32, handle: String) -> Result<Status, Self::Error> {
        self.handles.remove(&handle);
        Ok(ok(id))
    }
    async fn read(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        len: u32,
    ) -> Result<Data, Self::Error> {
        let files = self.files.lock().unwrap();
        let name = self.handles.get(&handle).ok_or(StatusCode::Failure)?;
        let bytes = files.files.get(name).ok_or(StatusCode::NoSuchFile)?;
        let start = offset as usize;
        if start >= bytes.len() {
            return Err(StatusCode::Eof);
        }
        let end = (start + len as usize).min(bytes.len());
        Ok(Data {
            id,
            data: bytes[start..end].to_vec(),
        })
    }
    async fn write(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        data: Vec<u8>,
    ) -> Result<Status, Self::Error> {
        let mut files = self.files.lock().unwrap();
        let name = self.handles.get(&handle).ok_or(StatusCode::Failure)?;
        let bytes = files.files.get_mut(name).ok_or(StatusCode::NoSuchFile)?;
        let end = offset as usize + data.len();
        if end > 16 * 1024 * 1024 {
            return Err(StatusCode::Failure);
        }
        bytes.resize(bytes.len().max(end), 0);
        bytes[offset as usize..end].copy_from_slice(&data);
        Ok(ok(id))
    }
    async fn rename(
        &mut self,
        id: u32,
        oldpath: String,
        newpath: String,
    ) -> Result<Status, Self::Error> {
        let mut files = self.files.lock().unwrap();
        if files.files.contains_key(&newpath) {
            return Err(StatusCode::Failure);
        }
        let data = files.files.remove(&oldpath).ok_or(StatusCode::NoSuchFile)?;
        files.files.insert(newpath, data);
        Ok(ok(id))
    }
    async fn remove(&mut self, id: u32, path: String) -> Result<Status, Self::Error> {
        self.files
            .lock()
            .unwrap()
            .files
            .remove(&path)
            .ok_or(StatusCode::NoSuchFile)?;
        Ok(ok(id))
    }
    async fn mkdir(
        &mut self,
        id: u32,
        path: String,
        _attrs: FileAttributes,
    ) -> Result<Status, Self::Error> {
        self.files.lock().unwrap().dirs.insert(path);
        Ok(ok(id))
    }
}
pub async fn start() -> Fixture {
    let key = PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519).unwrap();
    let fingerprint = key.public_key().fingerprint(HashAlg::Sha256).to_string();
    let config = Arc::new(server::Config {
        keys: vec![key],
        auth_rejection_time: Duration::from_millis(10),
        auth_rejection_time_initial: Some(Duration::from_millis(0)),
        ..Default::default()
    });
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .unwrap();
    let address = listener.local_addr().unwrap();
    let files = Arc::new(Mutex::new(Files {
        files: HashMap::from([("/hello.txt".into(), b"hello over SFTP".to_vec())]),
        dirs: HashSet::from(["/".into()]),
    }));
    let auth_calls = Arc::new(AtomicUsize::new(0));
    let server_files = files.clone();
    let auth = auth_calls.clone();
    let task = tokio::spawn(async move {
        let mut clients = tokio::task::JoinSet::new();
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                break;
            };
            let config = config.clone();
            let handler = Handler {
                channels: HashMap::new(),
                files: server_files.clone(),
                auth_calls: auth.clone(),
            };
            clients.spawn(async move {
                if let Ok(running) = server::run_stream(config, stream, handler).await {
                    let _ = running.await;
                }
            });
        }
    });
    let mut handle = russh::client::connect(
        super::ssh::config(),
        address,
        super::ssh::Verifier {
            expected: Some(fingerprint.clone()),
            observed: Arc::new(Mutex::new(None)),
        },
    )
    .await
    .unwrap();
    assert!(handle
        .authenticate_password("fixture", "fixture-pass")
        .await
        .unwrap()
        .success());
    let channel = handle.channel_open_session().await.unwrap();
    let (_read, writer) = channel.split();
    let remote = Arc::new(super::ssh::Remote {
        handle,
        writer: tokio::sync::Mutex::new(writer),
        sftp: OnceCell::new(),
    });
    let mut s = Arc::try_unwrap(test_session(String::new())).ok().unwrap();
    s.profile.kind = "ssh".into();
    s.profile.host = "127.0.0.1".into();
    s.profile.port = address.port();
    s.profile.username = "fixture".into();
    s.profile.cwd = "/".into();
    *s.backend.lock().unwrap() = Some(Backend::Ssh(remote));
    Fixture {
        session: Arc::new(s),
        files,
        auth_calls,
        address,
        fingerprint,
        task,
    }
}
