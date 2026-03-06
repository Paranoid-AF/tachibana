use std::path::PathBuf;

use serde_json::json;

use idevice::usbmuxd::{UsbmuxdAddr, UsbmuxdConnection};
use isideload::sideload::builder::MaxCertsBehavior;
use isideload::sideload::{SideloaderBuilder, TeamSelection};

use crate::ipc;
use crate::session::SessionState;
use crate::types::{InstallAppParams, SignAppParams};

pub async fn sign(state: &mut SessionState, id: &str, params: SignAppParams) {
    // Clone the session so sideloader can own it
    let dev_session = match state.dev_session.clone() {
        Some(s) => s,
        None => {
            ipc::send_error(id, "AUTH_REQUIRED", "Not logged in. Call 'login' first.");
            return;
        }
    };

    let email = state
        .account
        .as_ref()
        .map(|a| a.email.clone())
        .unwrap_or_default();

    let storage = state.storage();
    let app_path = PathBuf::from(&params.app_path);

    if params.team_id.is_some() {
        tracing::warn!("teamId selection not yet supported for sideloading; using first team");
    }

    let mut sideloader = SideloaderBuilder::new(dev_session, email)
        .team_selection(TeamSelection::First)
        .max_certs_behavior(MaxCertsBehavior::Revoke)
        .storage(storage)
        .build();

    ipc::send_event(
        "progress",
        json!({ "requestId": id, "stage": "signing", "message": "Signing application..." }),
    );

    match sideloader.sign_app(app_path, None, false).await {
        Ok((signed_path, _special_app)) => {
            ipc::send_success(
                id,
                json!({ "signedPath": signed_path.to_string_lossy() }),
            );
        }
        Err(e) => {
            ipc::send_error(id, "SIGNING_ERROR", &format!("Failed to sign app: {e}"));
        }
    }
}

pub async fn install(state: &mut SessionState, id: &str, params: InstallAppParams) {
    // Clone the session so sideloader can own it
    let dev_session = match state.dev_session.clone() {
        Some(s) => s,
        None => {
            ipc::send_error(id, "AUTH_REQUIRED", "Not logged in. Call 'login' first.");
            return;
        }
    };

    let email = state
        .account
        .as_ref()
        .map(|a| a.email.clone())
        .unwrap_or_default();

    let storage = state.storage();
    let app_path = PathBuf::from(&params.app_path);

    if params.team_id.is_some() {
        tracing::warn!("teamId selection not yet supported for sideloading; using first team");
    }

    let mut sideloader = SideloaderBuilder::new(dev_session, email)
        .team_selection(TeamSelection::First)
        .max_certs_behavior(MaxCertsBehavior::Revoke)
        .storage(storage)
        .build();

    ipc::send_event(
        "progress",
        json!({ "requestId": id, "stage": "connecting", "message": "Connecting to device..." }),
    );

    // Get device from usbmuxd and create a provider
    let mut conn = match UsbmuxdConnection::default().await {
        Ok(c) => c,
        Err(e) => {
            ipc::send_error(id, "DEVICE_ERROR", &format!("Failed to connect to usbmuxd: {e}"));
            return;
        }
    };

    let device = match conn.get_device(&params.udid).await {
        Ok(d) => d,
        Err(e) => {
            ipc::send_error(id, "DEVICE_ERROR", &format!("Device not found: {e}"));
            return;
        }
    };

    let provider = device.to_provider(UsbmuxdAddr::default(), "kani-isideload");

    ipc::send_event(
        "progress",
        json!({ "requestId": id, "stage": "signing", "message": "Signing and installing..." }),
    );

    match sideloader
        .install_app(&provider, app_path, false)
        .await
    {
        Ok(_) => {
            ipc::send_success(id, json!({ "success": true }));
        }
        Err(e) => {
            ipc::send_error(
                id,
                "INSTALL_ERROR",
                &format!("Failed to install app: {e}"),
            );
        }
    }
}
