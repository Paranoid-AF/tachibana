use idevice::usbmuxd::UsbmuxdConnection;
use isideload::dev::devices::DevicesApi;
use isideload::dev::teams::TeamsApi;

use crate::session::{self, SessionState};
use crate::types::{ConnectedDevice, Device};

/// List devices registered on the Apple Developer Portal.
pub async fn list(
    state: &mut SessionState,
    team_id: Option<&str>,
) -> napi::Result<Vec<Device>> {
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
        .map(|d| Device {
            udid: d.device_number.clone(),
            name: d.name.clone().unwrap_or_default(),
            status: d.status.clone().unwrap_or_default(),
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
pub async fn list_connected() -> napi::Result<Vec<ConnectedDevice>> {
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect to usbmuxd: {e}")))?;

    let devices = conn
        .get_devices()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to list connected devices: {e}")))?;

    Ok(devices
        .iter()
        .map(|d| ConnectedDevice {
            udid: d.udid.clone(),
            name: d.udid.clone(),
            product_type: String::new(),
            product_version: String::new(),
        })
        .collect())
}
