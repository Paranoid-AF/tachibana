use std::collections::HashMap;
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

/// Establish CDTunnel and return AdapterHandle + RSD port.
///
/// Manually constructs CoreDeviceProxy instead of using `IdeviceService::connect()`
/// because that trait method uses `async fn in trait` which produces futures that are
/// not Send-for-all-lifetimes when called with `&dyn IdeviceProvider`. The NAPI macro
/// requires Send futures. By calling `IdeviceProvider` methods directly (which return
/// `Pin<Box<dyn Future + Send>>`) and using concrete constructors, the entire future
/// chain remains Send.
async fn setup_tunnel(udid: &str) -> Result<(AdapterHandle, u16), String> {
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| format!("usbmuxd: {e}"))?;

    let device = conn
        .get_device(udid)
        .await
        .map_err(|e| format!("Device not found: {e}"))?;

    let provider = device.to_provider(UsbmuxdAddr::default(), "tbana-xctest");

    // Connect to lockdownd manually (port 62078)
    let idevice = provider
        .connect(LockdownClient::LOCKDOWND_PORT)
        .await
        .map_err(|e| format!("lockdown connect: {e}"))?;
    let mut lockdown = LockdownClient::new(idevice);

    // Start lockdown session with device pairing
    let pairing = provider
        .get_pairing_file()
        .await
        .map_err(|e| format!("pairing file: {e}"))?;
    lockdown
        .start_session(&pairing)
        .await
        .map_err(|e| format!("lockdown session: {e}"))?;

    // Start CoreDeviceProxy service and get its port
    let (port, ssl) = lockdown
        .start_service("com.apple.internal.devicecompute.CoreDeviceProxy")
        .await
        .map_err(|e| format!("start service: {e}"))?;

    // Connect to the service port
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

    // Perform CDTunnel handshake
    let proxy = CoreDeviceProxy::new(svc_idevice)
        .await
        .map_err(|e| format!("CoreDeviceProxy: {e}"))?;

    let rsd_port = proxy.handshake.server_rsd_port;

    let adapter = proxy
        .create_software_tunnel()
        .map_err(|e| format!("Software tunnel: {e}"))?;

    Ok((adapter.to_async_handle(), rsd_port))
}

/// Start an XCUITest session on the device (iOS 17+ via CDTunnel).
pub async fn start_xcuitest(
    udid: String,
    bundle_id: String,
    test_runner_bundle_id: String,
    env: HashMap<String, String>,
) -> napi::Result<u32> {
    let session_uuid = Uuid::new_v4();
    info!("XCTest session {session_uuid} for {bundle_id} on {udid}");

    // CDTunnel setup (isolated to avoid &dyn IdeviceProvider Send issues)
    let (mut handle, rsd_port) = setup_tunnel(&udid)
        .await
        .map_err(|e| napi::Error::from_reason(e))?;

    // RSD handshake
    let rsd_stream = handle
        .connect_to_service_port(rsd_port)
        .await
        .map_err(|e| napi::Error::from_reason(format!("RSD connect: {e}")))?;

    let rsd = RsdHandshake::new(rsd_stream)
        .await
        .map_err(|e| napi::Error::from_reason(format!("RSD handshake: {e}")))?;

    // Discover service ports
    let testmanagerd_port = rsd
        .services
        .get(TESTMANAGERD_SERVICE)
        .ok_or_else(|| napi::Error::from_reason(format!("{TESTMANAGERD_SERVICE} not found")))?
        .port;

    let instruments_port = rsd
        .services
        .get(INSTRUMENTS_SERVICE)
        .ok_or_else(|| napi::Error::from_reason(format!("{INSTRUMENTS_SERVICE} not found")))?
        .port;

    // Find WDA app path
    let app_path = find_app_path(&mut handle, &rsd, &test_runner_bundle_id)
        .await
        .map_err(|e| napi::Error::from_reason(e))?;
    let test_bundle_path = format!("{app_path}/PlugIns/WebDriverAgentRunner.xctest");
    info!("Test bundle: {test_bundle_path}");

    // Two connections to testmanagerd
    let tm_stream1 = handle
        .connect_to_service_port(testmanagerd_port)
        .await
        .map_err(|e| napi::Error::from_reason(format!("testmanagerd conn1: {e}")))?;
    let tm_stream2 = handle
        .connect_to_service_port(testmanagerd_port)
        .await
        .map_err(|e| napi::Error::from_reason(format!("testmanagerd conn2: {e}")))?;

    let mut conn1 = RemoteServerClient::new(tm_stream1);
    let mut conn2 = RemoteServerClient::new(tm_stream2);

    conn1.read_message(0).await
        .map_err(|e| napi::Error::from_reason(format!("conn1 handshake: {e}")))?;
    conn2.read_message(0).await
        .map_err(|e| napi::Error::from_reason(format!("conn2 handshake: {e}")))?;

    // IDE session on conn1
    let mut ide_channel = conn1
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

    // Launch test runner via instruments ProcessControl
    let inst_stream = handle
        .connect_to_service_port(instruments_port)
        .await
        .map_err(|e| napi::Error::from_reason(format!("instruments connect: {e}")))?;

    let mut instruments = RemoteServerClient::new(inst_stream);
    instruments.read_message(0).await
        .map_err(|e| napi::Error::from_reason(format!("instruments handshake: {e}")))?;

    let pid = {
        let mut pc = idevice::dvt::process_control::ProcessControlClient::new(&mut instruments)
            .await
            .map_err(|e| napi::Error::from_reason(format!("ProcessControl: {e}")))?;

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
        pc.launch_app(&test_runner_bundle_id, Some(launch_env), None, false, true)
            .await
            .map_err(|e| napi::Error::from_reason(format!("Launch: {e}")))?
    };
    info!("PID: {pid}");

    // Control session on conn2
    let mut ctrl_channel = conn2
        .make_channel(IDE_CHANNEL)
        .await
        .map_err(|e| napi::Error::from_reason(format!("control channel: {e}")))?;

    ctrl_channel
        .call_method(
            Some("_IDE_initiateControlSessionWithCapabilities:"),
            Some(vec![AuxValue::archived_value(ide_capabilities())]),
            true,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("control initiateSession: {e}")))?;

    ctrl_channel.read_message().await
        .map_err(|e| napi::Error::from_reason(format!("control resp: {e}")))?;

    ctrl_channel
        .call_method(
            Some("_IDE_authorizeTestSessionWithProcessID:"),
            Some(vec![AuxValue::I64(pid as i64)]),
            true,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("authorizeTestSession: {e}")))?;

    ctrl_channel.read_message().await
        .map_err(|e| napi::Error::from_reason(format!("authorize resp: {e}")))?;
    info!("Test session authorized for PID {pid}");

    // Wait for test bundle ready
    let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(30);
    while tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(tokio::time::Duration::from_secs(5), conn1.read_message(1)).await {
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
    conn1
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
        keepalive(handle, conn1, conn2).await;
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

async fn find_app_path(
    handle: &mut AdapterHandle,
    rsd: &RsdHandshake,
    bundle_id: &str,
) -> Result<String, String> {
    let svc_port = rsd
        .services
        .get("com.apple.coredevice.appservice")
        .ok_or("appservice not found in RSD")?
        .port;

    let stream = handle
        .connect_to_service_port(svc_port)
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

    Err(format!("App {bundle_id} not found on device"))
}

async fn keepalive(
    _handle: AdapterHandle,
    mut conn1: RemoteServerClient<Box<dyn ReadWrite>>,
    _conn2: RemoteServerClient<Box<dyn ReadWrite>>,
) {
    loop {
        tokio::select! {
            msg = conn1.read_message(1) => {
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
