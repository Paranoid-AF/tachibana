use std::path::PathBuf;

use idevice::usbmuxd::{UsbmuxdAddr, UsbmuxdConnection};
use isideload::sideload::builder::MaxCertsBehavior;
use isideload::sideload::{SideloaderBuilder, TeamSelection};

use crate::session::SessionState;

pub async fn sign(
    state: &mut SessionState,
    app_path: &str,
    team_id: Option<&str>,
) -> napi::Result<String> {
    let dev_session = state
        .dev_session
        .clone()
        .ok_or_else(|| napi::Error::from_reason("Not logged in. Call 'login' first."))?;

    let email = state
        .account
        .as_ref()
        .map(|a| a.email.clone())
        .unwrap_or_default();

    let storage = state.storage();
    let app_path = PathBuf::from(app_path);

    if team_id.is_some() {
        tracing::warn!("teamId selection not yet supported for sideloading; using first team");
    }

    let mut sideloader = SideloaderBuilder::new(dev_session, email)
        .team_selection(TeamSelection::First)
        .max_certs_behavior(MaxCertsBehavior::Revoke)
        .storage(storage)
        .build();

    let (signed_path, _) = sideloader
        .sign_app(app_path, None, false)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to sign app: {e}")))?;

    Ok(signed_path.to_string_lossy().into_owned())
}

pub async fn install(
    state: &mut SessionState,
    app_path: &str,
    udid: &str,
    team_id: Option<&str>,
) -> napi::Result<()> {
    let dev_session = state
        .dev_session
        .clone()
        .ok_or_else(|| napi::Error::from_reason("Not logged in. Call 'login' first."))?;

    let email = state
        .account
        .as_ref()
        .map(|a| a.email.clone())
        .unwrap_or_default();

    let storage = state.storage();
    let app_path = PathBuf::from(app_path);

    if team_id.is_some() {
        tracing::warn!("teamId selection not yet supported for sideloading; using first team");
    }

    let mut sideloader = SideloaderBuilder::new(dev_session, email)
        .team_selection(TeamSelection::First)
        .max_certs_behavior(MaxCertsBehavior::Revoke)
        .storage(storage)
        .build();

    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect to usbmuxd: {e}")))?;

    let device = conn
        .get_device(udid)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Device not found: {e}")))?;

    let provider = device.to_provider(UsbmuxdAddr::default(), "kani-isideload");

    sideloader
        .install_app(&provider, app_path, false)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to install app: {e}")))?;

    Ok(())
}
