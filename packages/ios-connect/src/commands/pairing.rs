use uuid::Uuid;

use idevice::services::lockdown::LockdownClient;
use idevice::usbmuxd::UsbmuxdConnection;

/// Pair the device with this host, triggering the "Trust This Computer?" dialog on the device.
/// Returns true when pairing succeeds.
pub async fn pair_device(udid: &str) -> napi::Result<bool> {
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect to usbmuxd: {e}")))?;

    let device = conn
        .get_device(udid)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Device not found: {e}")))?;

    let system_buid = conn
        .get_buid()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get system BUID: {e}")))?;

    let host_id = Uuid::new_v4().to_string().to_uppercase();

    // connect_to_device consumes conn, so this must be last use of conn
    let idevice_conn = conn
        .connect_to_device(device.device_id, LockdownClient::LOCKDOWND_PORT, "tbana-isideload")
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect to lockdown: {e}")))?;

    let mut lockdown = LockdownClient::new(idevice_conn);

    let pair_file = lockdown
        .pair(host_id, system_buid, None)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Pairing failed: {e}")))?;

    let pair_bytes = pair_file
        .serialize()
        .map_err(|e| napi::Error::from_reason(format!("Failed to serialize pairing record: {e}")))?;

    let mut save_conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to reconnect to usbmuxd: {e}")))?;

    save_conn
        .save_pair_record(udid, pair_bytes)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to save pairing record: {e}")))?;

    Ok(true)
}

/// Check whether the device has a pairing record stored in usbmuxd.
pub async fn validate_pairing(udid: &str) -> napi::Result<bool> {
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect to usbmuxd: {e}")))?;

    Ok(conn.get_pair_record(udid).await.is_ok())
}
