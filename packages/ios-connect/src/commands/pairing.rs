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

/// Check whether the device currently trusts this host by attempting a live SSL session.
/// For disconnected devices, falls back to checking if a pairing record exists locally.
pub async fn validate_pairing(udid: &str) -> napi::Result<bool> {
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect to usbmuxd: {e}")))?;

    // No local record → definitely not paired
    let pair_record = match conn.get_pair_record(udid).await {
        Ok(r) => r,
        Err(_) => return Ok(false),
    };

    // Device not connected → can't do live check, assume paired (record exists)
    let device = match conn.get_device(udid).await {
        Ok(d) => d,
        Err(_) => return Ok(true),
    };

    let idevice_conn = match conn
        .connect_to_device(device.device_id, LockdownClient::LOCKDOWND_PORT, "tbana-isideload")
        .await
    {
        Ok(c) => c,
        Err(_) => return Ok(true),
    };

    let mut lockdown = LockdownClient::new(idevice_conn);

    // SSL handshake fails if device revoked trust
    Ok(lockdown.start_session(&pair_record).await.is_ok())
}
