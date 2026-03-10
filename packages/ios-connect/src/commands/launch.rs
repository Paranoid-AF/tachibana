use std::collections::HashMap;

use idevice::core_device_proxy::CoreDeviceProxy;
use idevice::dvt::process_control::ProcessControlClient;
use idevice::dvt::remote_server::RemoteServerClient;
use idevice::rsd::RsdHandshake;
use idevice::usbmuxd::{UsbmuxdAddr, UsbmuxdConnection};
use idevice::IdeviceService;

/// Launch an app on a connected device using the DVT instruments protocol.
/// Returns the PID of the launched process.
pub async fn launch_app(udid: &str, bundle_id: &str) -> napi::Result<u64> {
    launch_app_with_env(udid, bundle_id, None).await
}

/// Launch an app via DVT instruments with optional environment variables.
/// Tries CDTunnel path first (iOS 17+), falls back to lockdown path (iOS < 17).
pub async fn launch_app_with_env(
    udid: &str,
    bundle_id: &str,
    env_vars: Option<HashMap<String, String>>,
) -> napi::Result<u64> {
    // Convert env to plist dictionary
    let env = env_vars.map(|vars| {
        let mut dict = plist::Dictionary::new();
        for (k, v) in vars {
            dict.insert(k, plist::Value::String(v));
        }
        dict
    });

    // Try CDTunnel → RSD → instruments (iOS 17+)
    let cdtunnel_err = match launch_via_cdtunnel(udid, bundle_id, env.clone()).await {
        Ok(pid) => return Ok(pid),
        Err(e) => e,
    };

    // Fallback: lockdown → instruments (iOS < 17)
    match launch_via_lockdown(udid, bundle_id, env).await {
        Ok(pid) => Ok(pid),
        Err(lockdown_err) => Err(napi::Error::from_reason(format!(
            "CDTunnel path: {}. Lockdown path: {}",
            cdtunnel_err, lockdown_err
        ))),
    }
}

/// Launch via CoreDeviceProxy CDTunnel → RSD → instruments.
/// Works on iOS 17+ where instruments isn't available through lockdown.
async fn launch_via_cdtunnel(
    udid: &str,
    bundle_id: &str,
    env: Option<plist::Dictionary>,
) -> napi::Result<u64> {
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("usbmuxd: {e}")))?;

    let device = conn
        .get_device(udid)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Device not found: {e}")))?;

    let provider = device.to_provider(UsbmuxdAddr::default(), "tbana-isideload");

    // Start CoreDeviceProxy via lockdown → CDTunnel handshake
    let proxy = CoreDeviceProxy::connect(&provider)
        .await
        .map_err(|e| napi::Error::from_reason(format!("CoreDeviceProxy: {e}")))?;

    let rsd_port = proxy.handshake.server_rsd_port;

    // Software TCP tunnel over CDTunnel (userspace, no root needed)
    let adapter = proxy
        .create_software_tunnel()
        .map_err(|e| napi::Error::from_reason(format!("Software tunnel: {e}")))?;

    let mut handle = adapter.to_async_handle();

    // RSD handshake — discover services
    let rsd_stream = handle
        .connect(rsd_port)
        .await
        .map_err(|e| napi::Error::from_reason(format!("RSD connect: {e}")))?;

    let rsd = RsdHandshake::new(rsd_stream)
        .await
        .map_err(|e| napi::Error::from_reason(format!("RSD handshake: {e}")))?;

    // Look up instruments service port from RSD
    let service_name = "com.apple.instruments.dtservicehub";
    let svc = rsd
        .services
        .get(service_name)
        .ok_or_else(|| napi::Error::from_reason(format!("{service_name} not found in RSD")))?;

    let instruments_port = svc.port;

    // Connect to instruments and create RemoteServerClient directly
    let stream = handle
        .connect(instruments_port)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Instruments connect: {e}")))?;

    let mut remote_server = RemoteServerClient::new(stream);

    // Read initial DTX message from the service (required before sending commands)
    remote_server
        .read_message(0)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Instruments handshake: {e}")))?;

    let mut process_control = ProcessControlClient::new(&mut remote_server)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Process control: {e}")))?;

    let pid = process_control
        .launch_app(bundle_id, env, None, false, true)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Launch failed: {e}")))?;

    Ok(pid)
}

/// Launch via lockdown → instruments (iOS < 17 path).
async fn launch_via_lockdown(
    udid: &str,
    bundle_id: &str,
    env: Option<plist::Dictionary>,
) -> napi::Result<u64> {
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("usbmuxd: {e}")))?;

    let device = conn
        .get_device(udid)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Device not found: {e}")))?;

    let provider = device.to_provider(UsbmuxdAddr::default(), "tbana-isideload");

    let mut remote_server = RemoteServerClient::connect(&provider)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Instruments connect: {e}")))?;

    let mut process_control = ProcessControlClient::new(&mut remote_server)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Process control: {e}")))?;

    let pid = process_control
        .launch_app(bundle_id, env, None, false, true)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Launch failed: {e}")))?;

    Ok(pid)
}
