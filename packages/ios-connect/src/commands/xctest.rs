use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::str::FromStr;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::OnceLock;

use idevice::core_device::AppServiceClient;
use idevice::core_device_proxy::CoreDeviceProxy;
use idevice::dvt::message::AuxValue;
use idevice::dvt::remote_server::RemoteServerClient;
use idevice::lockdown::LockdownClient;
use idevice::provider::RsdProvider;
use idevice::rsd::RsdHandshake;
use idevice::tcp::handle::AdapterHandle;
use idevice::tunneld;
use idevice::usbmuxd::{UsbmuxdAddr, UsbmuxdConnection};
use idevice::provider::IdeviceProvider;
use idevice::ReadWrite;
use tokio::sync::Mutex;
use tokio::task::AbortHandle;
use tracing::{debug, info, warn};
use uuid::Uuid;

static SESSIONS: OnceLock<Mutex<HashMap<u32, AbortHandle>>> = OnceLock::new();
static NEXT_SESSION: AtomicU32 = AtomicU32::new(1);

fn sessions() -> &'static Mutex<HashMap<u32, AbortHandle>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

const TESTMANAGERD_SERVICE: &str = "com.apple.dt.testmanagerd.remote";
const INSTRUMENTS_SERVICE: &str = "com.apple.instruments.dtservicehub";
const IDE_CHANNEL: &str =
    "dtxproxy:XCTestManager_IDEInterface:XCTestManager_DaemonConnectionInterface";

fn ide_capabilities() -> plist::Value {
    use plist::{Dictionary, Value};
    let mut caps = Dictionary::new();
    caps.insert(
        "XCTCapabilities".into(),
        Value::Dictionary({
            let mut d = Dictionary::new();
            d.insert("skippedTestIdentifiersKey".into(), Value::Boolean(true));
            d.insert("expectedFailureTestIdentifiersKey".into(), Value::Boolean(true));
            d
        }),
    );
    Value::Dictionary(caps)
}

/// Wrapper around different tunnel providers so the rest of the code
/// can use a single type for connecting to service ports.
enum TunnelProvider {
    /// Software TCP/IP tunnel via CoreDeviceProxy (USB-only, limited services)
    Software(AdapterHandle),
    /// External tunnel via pymobiledevice3's tunneld (full developer services)
    External(IpAddr),
}

impl TunnelProvider {
    async fn connect_to_service_port(
        &mut self,
        port: u16,
    ) -> Result<Box<dyn ReadWrite>, idevice::IdeviceError> {
        match self {
            Self::Software(handle) => handle.connect_to_service_port(port).await,
            Self::External(ip) => ip.connect_to_service_port(port).await,
        }
    }
}

/// Try to connect via pymobiledevice3's tunneld first (provides full developer
/// services including testmanagerd). Falls back to CoreDeviceProxy if tunneld
/// is not running.
async fn setup_tunnel(udid: &str) -> Result<(TunnelProvider, u16), String> {
    // Try tunneld first — it provides the full service set (including testmanagerd)
    match try_tunneld(udid).await {
        Ok(result) => return Ok(result),
        Err(e) => info!("tunneld not available ({e}), falling back to CoreDeviceProxy"),
    }

    // Fallback: CoreDeviceProxy software tunnel (limited service set)
    let (handle, rsd_port) = setup_cdtunnel(udid).await?;
    Ok((TunnelProvider::Software(handle), rsd_port))
}

/// Query pymobiledevice3's tunneld for an existing tunnel to this device.
async fn try_tunneld(udid: &str) -> Result<(TunnelProvider, u16), String> {
    let addr = SocketAddr::new(
        IpAddr::from_str("127.0.0.1").unwrap(),
        tunneld::DEFAULT_PORT,
    );

    let devices = tunneld::get_tunneld_devices(addr)
        .await
        .map_err(|e| format!("tunneld query failed: {e}"))?;

    let tunnel_info = devices
        .get(udid)
        .ok_or_else(|| format!("device {udid} not found in tunneld"))?;

    let tunnel_ip: IpAddr = tunnel_info
        .tunnel_address
        .parse()
        .map_err(|e| format!("invalid tunnel address: {e}"))?;
    let rsd_port = tunnel_info.tunnel_port;

    info!(
        "Using tunneld: {}:{} (interface: {})",
        tunnel_ip, rsd_port, tunnel_info.interface
    );

    Ok((TunnelProvider::External(tunnel_ip), rsd_port))
}

/// Establish CDTunnel via CoreDeviceProxy (USB, limited service set).
async fn setup_cdtunnel(udid: &str) -> Result<(AdapterHandle, u16), String> {
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| format!("usbmuxd: {e}"))?;

    let device = conn
        .get_device(udid)
        .await
        .map_err(|e| format!("Device not found: {e}"))?;

    let provider = device.to_provider(UsbmuxdAddr::default(), "tbana-xctest");

    let idevice = provider
        .connect(LockdownClient::LOCKDOWND_PORT)
        .await
        .map_err(|e| format!("lockdown connect: {e}"))?;
    let mut lockdown = LockdownClient::new(idevice);

    let pairing = provider
        .get_pairing_file()
        .await
        .map_err(|e| format!("pairing file: {e}"))?;
    lockdown
        .start_session(&pairing)
        .await
        .map_err(|e| format!("lockdown session: {e}"))?;

    let (port, ssl) = lockdown
        .start_service("com.apple.internal.devicecompute.CoreDeviceProxy")
        .await
        .map_err(|e| format!("start service: {e}"))?;

    let mut svc_idevice = provider
        .connect(port)
        .await
        .map_err(|e| format!("service connect: {e}"))?;
    if ssl {
        svc_idevice
            .start_session(&pairing, false)
            .await
            .map_err(|e| format!("service SSL: {e}"))?;
    }

    let proxy = CoreDeviceProxy::new(svc_idevice)
        .await
        .map_err(|e| format!("CoreDeviceProxy: {e}"))?;

    let rsd_port = proxy.handshake.server_rsd_port;

    let adapter = proxy
        .create_software_tunnel()
        .map_err(|e| format!("Software tunnel: {e}"))?;

    Ok((adapter.to_async_handle(), rsd_port))
}

/// Set up a tunnel and perform RSD handshake, trying external tunnel first
/// then falling back to CoreDeviceProxy if testmanagerd is missing.
async fn setup_and_handshake(
    udid: &str,
    tunnel_address: Option<String>,
    tunnel_rsd_port: Option<u16>,
) -> Result<(TunnelProvider, RsdHandshake), String> {
    // Try external tunnel first (e.g. go-ios kernel TUN)
    if let (Some(addr), Some(port)) = (&tunnel_address, tunnel_rsd_port) {
        let ip: IpAddr = addr
            .parse()
            .map_err(|e| format!("Invalid tunnel address '{addr}': {e}"))?;
        eprintln!("[xctest] Trying external tunnel: {ip}:{port}");

        let mut provider = TunnelProvider::External(ip);

        // Retry RSD connection — freshly started tunnels may need a moment
        // for the TUN interface to become fully routable
        let mut rsd = None;
        let mut last_err = String::new();
        for attempt in 1..=5 {
            match provider.connect_to_service_port(port).await {
                Ok(stream) => match RsdHandshake::new(stream).await {
                    Ok(r) => {
                        rsd = Some(r);
                        break;
                    }
                    Err(e) => last_err = format!("RSD handshake: {e}"),
                },
                Err(e) => last_err = format!("RSD connect: {e}"),
            }
            eprintln!("[xctest] External tunnel attempt {attempt}/5 failed: {last_err}, retrying...");
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }
        let rsd = rsd.ok_or_else(|| {
            format!("External tunnel RSD failed after 5 attempts: {last_err}")
        })?;

        let mut service_names: Vec<&str> = rsd.services.keys().map(|s| s.as_str()).collect();
        service_names.sort();
        eprintln!(
            "[xctest] External tunnel RSD services ({} total): {:?}",
            service_names.len(),
            service_names
        );

        if rsd.services.contains_key(TESTMANAGERD_SERVICE) {
            eprintln!("[xctest] testmanagerd found in external tunnel, using it");
            return Ok((provider, rsd));
        }

        eprintln!(
            "[xctest] testmanagerd NOT in external tunnel RSD, falling back to CoreDeviceProxy"
        );
    }

    // Fallback: own tunnel setup (tunneld → CoreDeviceProxy)
    let (mut provider, rsd_port) = setup_tunnel(udid).await?;

    let rsd_stream = provider
        .connect_to_service_port(rsd_port)
        .await
        .map_err(|e| format!("RSD connect: {e}"))?;
    let rsd = RsdHandshake::new(rsd_stream)
        .await
        .map_err(|e| format!("RSD handshake: {e}"))?;

    let mut service_names: Vec<&str> = rsd.services.keys().map(|s| s.as_str()).collect();
    service_names.sort();
    eprintln!(
        "[xctest] Fallback RSD services ({} total): {:?}",
        service_names.len(),
        service_names
    );

    Ok((provider, rsd))
}

/// Start an XCUITest session on the device (iOS 17+).
///
/// If `tunnel_address` and `tunnel_rsd_port` are provided, connects directly
/// to that address (e.g. through a go-ios kernel TUN tunnel).
/// Otherwise tries tunneld, then falls back to CoreDeviceProxy.
pub async fn start_xcuitest(
    udid: String,
    bundle_id: String,
    test_runner_bundle_id: String,
    env: HashMap<String, String>,
    tunnel_address: Option<String>,
    tunnel_rsd_port: Option<u16>,
) -> napi::Result<u32> {
    let session_uuid = Uuid::new_v4();
    info!("XCTest session {session_uuid} for {bundle_id} on {udid}");

    let (mut provider, rsd) = setup_and_handshake(&udid, tunnel_address, tunnel_rsd_port)
        .await
        .map_err(|e| napi::Error::from_reason(e))?;

    // Discover service ports
    let instruments_port = rsd
        .services
        .get(INSTRUMENTS_SERVICE)
        .ok_or_else(|| {
            napi::Error::from_reason(format!(
                "{INSTRUMENTS_SERVICE} not found in RSD services."
            ))
        })?
        .port;

    let testmanagerd_port = rsd
        .services
        .get(TESTMANAGERD_SERVICE)
        .ok_or_else(|| {
            napi::Error::from_reason(format!(
                "{TESTMANAGERD_SERVICE} not found in RSD services."
            ))
        })?
        .port;

    // Find WDA app path
    let app_path = find_app_path(&mut provider, &rsd, &test_runner_bundle_id, &udid)
        .await
        .map_err(|e| napi::Error::from_reason(e))?;
    let test_bundle_path = format!("{app_path}/PlugIns/WebDriverAgentRunner.xctest");
    info!("Test bundle: {test_bundle_path}");

    // Single connection to testmanagerd — both IDE and control channels are
    // multiplexed over one DTX connection to avoid tunnel socket issues
    let tm_stream = provider
        .connect_to_service_port(testmanagerd_port)
        .await
        .map_err(|e| napi::Error::from_reason(format!("testmanagerd connect: {e}")))?;
    let mut testmanagerd = RemoteServerClient::new(tm_stream);
    testmanagerd.read_message(0).await
        .map_err(|e| napi::Error::from_reason(format!("testmanagerd handshake: {e}")))?;

    // IDE session channel
    let mut ide_channel = testmanagerd
        .make_channel(IDE_CHANNEL)
        .await
        .map_err(|e| napi::Error::from_reason(format!("make IDE channel: {e}")))?;

    ide_channel
        .call_method(
            Some("_IDE_initiateSessionWithIdentifier:capabilities:"),
            Some(vec![
                AuxValue::archived_value(plist::Value::Data(session_uuid.as_bytes().to_vec())),
                AuxValue::archived_value(ide_capabilities()),
            ]),
            true,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("IDE initiateSession: {e}")))?;

    ide_channel.read_message().await
        .map_err(|e| napi::Error::from_reason(format!("IDE initiateSession resp: {e}")))?;
    info!("IDE session initiated");

    // Control session — use the SAME channel as IDE session.
    // DTX doesn't allow two channels with the same proxy service, and opening
    // a second TCP connection through the TUN tunnel fails with socket errors.
    ide_channel
        .call_method(
            Some("_IDE_initiateControlSessionWithCapabilities:"),
            Some(vec![AuxValue::archived_value(ide_capabilities())]),
            true,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("control initiateSession: {e}")))?;

    ide_channel.read_message().await
        .map_err(|e| napi::Error::from_reason(format!("control resp: {e}")))?;
    info!("Control session initiated");

    // Launch test runner via instruments ProcessControl
    let inst_stream = provider
        .connect_to_service_port(instruments_port)
        .await
        .map_err(|e| napi::Error::from_reason(format!("instruments connect: {e}")))?;

    let mut instruments = RemoteServerClient::new(inst_stream);
    instruments.read_message(0).await
        .map_err(|e| napi::Error::from_reason(format!("instruments handshake: {e}")))?;

    let pid = {
        let mut launch_env = plist::Dictionary::new();
        for (k, v) in &env {
            launch_env.insert(k.clone(), plist::Value::String(v.clone()));
        }
        launch_env.insert(
            "XCTestSessionIdentifier".into(),
            plist::Value::String(session_uuid.to_string()),
        );
        launch_env.insert(
            "XCTestBundlePath".into(),
            plist::Value::String(test_bundle_path),
        );

        info!("Launching: {test_runner_bundle_id}");
        launch_app_verbose(&mut instruments, &test_runner_bundle_id, launch_env)
            .await
            .map_err(|e| napi::Error::from_reason(format!("Launch: {e}")))?
    };
    info!("PID: {pid}");

    // Authorize test session with the launched PID
    ide_channel
        .call_method(
            Some("_IDE_authorizeTestSessionWithProcessID:"),
            Some(vec![AuxValue::I64(pid as i64)]),
            true,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("authorizeTestSession: {e}")))?;

    ide_channel.read_message().await
        .map_err(|e| napi::Error::from_reason(format!("authorize resp: {e}")))?;
    info!("Test session authorized for PID {pid}");

    // Wait for test bundle ready
    let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(30);
    while tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(tokio::time::Duration::from_secs(5), testmanagerd.read_message(1)).await {
            Ok(Ok(msg)) => {
                let method = msg.data.as_ref().and_then(|v| v.as_string()).unwrap_or("");
                debug!("IDE callback: {method}");
                if method.contains("testBundleReady") || method.contains("testRunnerReady") {
                    break;
                }
            }
            Ok(Err(e)) => warn!("IDE read error: {e}"),
            Err(_) => debug!("Waiting for test bundle ready..."),
        }
    }

    // Start test plan
    testmanagerd
        .call_method(
            1,
            Some("_IDE_startExecutingTestPlanWithProtocolVersion:"),
            Some(vec![AuxValue::I64(36)]),
            true,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("startExecutingTestPlan: {e}")))?;
    info!("Test plan started");

    // Spawn keepalive task (all resources are Send)
    let session_id = NEXT_SESSION.fetch_add(1, Ordering::Relaxed);

    let abort_handle = tokio::spawn(async move {
        keepalive(provider, testmanagerd).await;
    })
    .abort_handle();

    sessions().lock().await.insert(session_id, abort_handle);
    info!("XCTest session {session_id} active");

    Ok(session_id)
}

/// Stop an XCUITest session.
pub async fn stop_xcuitest(session_id: u32) -> napi::Result<()> {
    if let Some(handle) = sessions().lock().await.remove(&session_id) {
        handle.abort();
        info!("XCTest session {session_id} stopped");
    }
    Ok(())
}

/// Launch an app via instruments ProcessControl with verbose error reporting.
/// This replaces the opaque `ProcessControlClient::launch_app()` so we can
/// see what the device actually returns on failure.
async fn launch_app_verbose(
    instruments: &mut RemoteServerClient<Box<dyn ReadWrite>>,
    bundle_id: &str,
    env_vars: plist::Dictionary,
) -> Result<u64, String> {
    use plist::Value;

    // Create ProcessControl channel (same as ProcessControlClient::new)
    let mut channel = instruments
        .make_channel("com.apple.instruments.server.services.processcontrol")
        .await
        .map_err(|e| format!("ProcessControl channel: {e}"))?;

    let options = plist::Dictionary::from_iter([
        ("StartSuspendedKey".to_string(), Value::Boolean(false)),
        ("KillExisting".to_string(), Value::Boolean(true)),
    ]);

    channel
        .call_method(
            Some(Value::String(
                "launchSuspendedProcessWithDevicePath:bundleIdentifier:environment:arguments:options:".into(),
            )),
            Some(vec![
                AuxValue::archived_value("/private/"),
                AuxValue::archived_value(bundle_id),
                AuxValue::archived_value(env_vars),
                AuxValue::archived_value(plist::Dictionary::new()),
                AuxValue::archived_value(options),
            ]),
            true,
        )
        .await
        .map_err(|e| format!("launch call: {e}"))?;

    let res = channel.read_message().await
        .map_err(|e| format!("launch read response: {e}"))?;

    match res.data {
        Some(Value::Integer(p)) => match p.as_unsigned() {
            Some(p) => Ok(p),
            None => Err(format!("Device returned non-unsigned PID: {p:?}")),
        },
        Some(other) => {
            // Log the actual response for debugging
            let mut buf = Vec::new();
            if plist::to_writer_xml(&mut buf, &other).is_ok() {
                let xml = String::from_utf8_lossy(&buf);
                Err(format!("Device returned non-PID response: {xml}"))
            } else {
                Err(format!("Device returned non-PID response: {other:?}"))
            }
        }
        None => Err("Device returned empty response (no data in message)".into()),
    }
}

async fn find_app_path(
    provider: &mut TunnelProvider,
    rsd: &RsdHandshake,
    bundle_id: &str,
    udid: &str,
) -> Result<String, String> {
    // Try CoreDevice appservice first (available on some tunnel types)
    if let Some(svc) = rsd.services.get("com.apple.coredevice.appservice") {
        let stream = provider
            .connect_to_service_port(svc.port)
            .await
            .map_err(|e| format!("AppService connect: {e}"))?;

        let mut app_svc = AppServiceClient::new(stream)
            .await
            .map_err(|e| format!("AppService init: {e}"))?;

        let apps = app_svc
            .list_apps(false, true, false, false, false)
            .await
            .map_err(|e| format!("AppService list_apps: {e}"))?;

        for app in &apps {
            if app.bundle_identifier == bundle_id {
                return Ok(app.path.clone());
            }
        }
        return Err(format!("App {bundle_id} not found on device (via appservice)"));
    }

    // Fallback: use installation_proxy via USB to get the app path
    eprintln!("[xctest] appservice not in RSD, falling back to installation_proxy via USB");
    find_app_path_via_instproxy(udid, bundle_id).await
}

/// Get app install path via USB installation_proxy (works without tunnel services).
async fn find_app_path_via_instproxy(udid: &str, bundle_id: &str) -> Result<String, String> {
    use idevice::services::installation_proxy::InstallationProxyClient;
    use idevice::IdeviceService;

    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| format!("usbmuxd: {e}"))?;

    let device = conn
        .get_device(udid)
        .await
        .map_err(|e| format!("Device not found: {e}"))?;

    let provider = device.to_provider(UsbmuxdAddr::default(), "tbana-xctest-instproxy");

    let mut client = InstallationProxyClient::connect(&provider)
        .await
        .map_err(|e| format!("InstallationProxy connect: {e}"))?;

    let apps: std::collections::HashMap<String, plist::Value> = client
        .get_apps(Some("User"), None)
        .await
        .map_err(|e| format!("get_apps: {e}"))?;

    if let Some(info) = apps.get(bundle_id) {
        if let Some(dict) = info.as_dictionary() {
            if let Some(path) = dict.get("Path").and_then(|v| v.as_string()) {
                return Ok(path.to_string());
            }
        }
    }

    Err(format!("App {bundle_id} not found via installation_proxy"))
}

async fn keepalive(
    _provider: TunnelProvider,
    mut testmanagerd: RemoteServerClient<Box<dyn ReadWrite>>,
) {
    loop {
        tokio::select! {
            msg = testmanagerd.read_message(1) => {
                match msg {
                    Ok(m) => {
                        let method = m.data.as_ref().and_then(|v| v.as_string()).unwrap_or("");
                        debug!("IDE message: {method}");
                    }
                    Err(e) => {
                        warn!("IDE channel closed: {e}");
                        return;
                    }
                }
            }
            _ = tokio::time::sleep(tokio::time::Duration::from_secs(60)) => {
                debug!("XCTest keepalive tick");
            }
        }
    }
}
