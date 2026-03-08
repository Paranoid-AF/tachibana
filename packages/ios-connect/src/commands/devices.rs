use idevice::usbmuxd::UsbmuxdConnection;
use isideload::dev::devices::DevicesApi;
use isideload::dev::teams::TeamsApi;

use crate::session::{self, SessionState};

/// List devices registered on the Apple Developer Portal.
pub async fn list(
    state: &mut SessionState,
    team_id: Option<&str>,
) -> napi::Result<Vec<serde_json::Value>> {
    let session = state
        .dev_session
        .as_mut()
        .ok_or_else(|| napi::Error::from_reason("Not logged in. Call 'login' first."))?;

    let teams = session
        .list_teams()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to list teams: {e}")))?;

    let team = session::select_team(teams, team_id)
        .ok_or_else(|| napi::Error::from_reason("No matching developer team found"))?;

    let devices = session
        .list_devices(
            &team,
            None::<isideload::dev::device_type::DeveloperDeviceType>,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to list devices: {e}")))?;

    Ok(devices
        .iter()
        .map(|d| {
            serde_json::json!({
                "udid": d.device_number,
                "name": d.name,
                "status": d.status,
            })
        })
        .collect())
}

/// Register a device on the Apple Developer Portal.
pub async fn register(
    state: &mut SessionState,
    udid: &str,
    name: &str,
    team_id: Option<&str>,
) -> napi::Result<()> {
    let session = state
        .dev_session
        .as_mut()
        .ok_or_else(|| napi::Error::from_reason("Not logged in. Call 'login' first."))?;

    let teams = session
        .list_teams()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to list teams: {e}")))?;

    let team = session::select_team(teams, team_id)
        .ok_or_else(|| napi::Error::from_reason("No matching developer team found"))?;

    session
        .add_device(
            &team,
            name,
            udid,
            None::<isideload::dev::device_type::DeveloperDeviceType>,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to register device: {e}")))?;

    Ok(())
}

/// List physically connected USB devices via idevice/usbmuxd.
pub async fn list_connected() -> napi::Result<Vec<serde_json::Value>> {
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect to usbmuxd: {e}")))?;

    let devices = conn
        .get_devices()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to list connected devices: {e}")))?;

    Ok(devices
        .iter()
        .map(|d| {
            serde_json::json!({
                "udid": d.udid,
                "name": d.udid,
                "productType": "",
                "productVersion": "",
            })
        })
        .collect())
}
