use std::path::PathBuf;
use std::sync::Arc;

use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction};
use napi_derive::napi;
use tokio::sync::Mutex;

mod commands;
mod session;
mod types;

use session::SessionState;
use types::*;

/// Primary entry point. Holds all Apple auth state for one account session.
#[napi]
pub struct Session {
    state: Arc<Mutex<SessionState>>,
}

#[napi]
impl Session {
    /// Create a new session.
    /// - `data_dir`: directory for persistent storage (certs, anisette state, signing records)
    /// - `anisette_url`: optional override for the anisette WebSocket server URL
    #[napi(constructor)]
    pub fn new(data_dir: String, anisette_url: Option<String>) -> Self {
        Session {
            state: Arc::new(Mutex::new(SessionState::new(
                PathBuf::from(data_dir),
                anisette_url,
            ))),
        }
    }

    /// Login to Apple ID. The `two_fa_callback` is called when 2FA is required;
    /// it must return the 6-digit code as a Promise<string>.
    #[napi]
    pub async fn login(
        &self,
        email: String,
        password: String,
        two_fa_callback: ThreadsafeFunction<TwoFaInfo, ErrorStrategy::Fatal>,
    ) -> napi::Result<()> {
        commands::auth::login(self.state.clone(), email, password, two_fa_callback).await
    }

    /// Returns the current session token data for external persistence.
    /// Call immediately after login. Returns null if not logged in via login().
    #[napi]
    pub async fn get_session_data(&self) -> napi::Result<Option<SessionData>> {
        commands::auth::get_session_data(self.state.clone()).await
    }

    /// Restores a developer session from externally persisted token data.
    /// Returns true if the session was successfully restored.
    #[napi]
    pub async fn restore_session(&self, data: SessionData) -> napi::Result<bool> {
        commands::auth::restore_session(self.state.clone(), data).await
    }

    /// Clears the in-memory session state. Call after invalidating persisted credentials.
    #[napi]
    pub async fn logout(&self) -> napi::Result<()> {
        commands::auth::logout(self.state.clone()).await
    }

    /// Delivers the 2FA verification code to the blocked `login` call.
    /// Call this after receiving a `twoFaCallback` notification from `login`.
    #[napi]
    pub async fn submit_two_fa(&self, code: String) -> napi::Result<()> {
        commands::auth::submit_two_fa(self.state.clone(), code).await
    }

    /// Requires Apple Account login. Returns current session state.
    #[napi]
    pub async fn get_session_info(&self) -> napi::Result<SessionInfo> {
        let state = self.state.lock().await;
        commands::auth::get_session_info(&state)
    }

    /// Requires Apple Account login. Lists all developer teams for the account.
    #[napi]
    pub async fn list_teams(&self) -> napi::Result<Vec<Team>> {
        let mut state = self.state.lock().await;
        commands::teams::list(&mut state).await
    }

    /// Requires Apple Account login. Lists development certificates.
    /// Pass `team_id` to scope to a specific team, or omit for the default team.
    #[napi]
    pub async fn list_certs(
        &self,
        team_id: Option<String>,
    ) -> napi::Result<Vec<Cert>> {
        let mut state = self.state.lock().await;
        commands::certs::list(&mut state, team_id.as_deref()).await
    }

    /// Requires Apple Account login. Revokes a development certificate by serial number.
    #[napi]
    pub async fn revoke_cert(
        &self,
        serial_number: String,
        team_id: Option<String>,
    ) -> napi::Result<()> {
        let mut state = self.state.lock().await;
        commands::certs::revoke(&mut state, &serial_number, team_id.as_deref()).await
    }

    /// Requires Apple Account login. Lists App IDs registered on the Apple Developer portal.
    #[napi]
    pub async fn list_app_ids(
        &self,
        team_id: Option<String>,
    ) -> napi::Result<Vec<AppId>> {
        let mut state = self.state.lock().await;
        commands::app_ids::list(&mut state, team_id.as_deref()).await
    }

    /// Requires Apple Account login. Creates a new App ID on the Apple Developer portal.
    #[napi]
    pub async fn create_app_id(
        &self,
        bundle_id: String,
        name: String,
        team_id: Option<String>,
    ) -> napi::Result<AppId> {
        let mut state = self.state.lock().await;
        commands::app_ids::create(&mut state, &bundle_id, &name, team_id.as_deref()).await
    }

    /// Requires Apple Account login. Lists devices registered on the Apple Developer portal.
    /// To enumerate USB-connected devices without auth, use the module-level `listConnectedDevices()`.
    #[napi]
    pub async fn list_devices(
        &self,
        team_id: Option<String>,
    ) -> napi::Result<Vec<Device>> {
        let mut state = self.state.lock().await;
        commands::devices::list(&mut state, team_id.as_deref()).await
    }

    /// Requires Apple Account login. Registers a device on the Apple Developer portal.
    #[napi]
    pub async fn register_device(
        &self,
        udid: String,
        name: String,
        team_id: Option<String>,
    ) -> napi::Result<()> {
        let mut state = self.state.lock().await;
        commands::devices::register(&mut state, &udid, &name, team_id.as_deref()).await
    }

    /// Requires Apple Account login. Signs an `.app` bundle using a certificate from the portal.
    /// Returns the path to the signed `.ipa`.
    #[napi]
    pub async fn sign_app(
        &self,
        app_path: String,
        team_id: Option<String>,
    ) -> napi::Result<String> {
        let mut state = self.state.lock().await;
        commands::sideload::sign(&mut state, &app_path, team_id.as_deref()).await
    }

    /// Requires Apple Account login. Signs and installs an app on the specified device.
    #[napi]
    pub async fn install_app(
        &self,
        app_path: String,
        udid: String,
        team_id: Option<String>,
    ) -> napi::Result<()> {
        let mut state = self.state.lock().await;
        commands::sideload::install(&mut state, &app_path, &udid, team_id.as_deref()).await
    }

    /// Does not require Apple Account. Lists photos from the device photo library via AFC.
    #[napi]
    pub async fn list_photos(
        &self,
        udid: String,
        limit: Option<u32>,
        cursor: Option<String>,
    ) -> napi::Result<ListPhotosPage> {
        commands::photos::list_photos(&udid, limit.map(|l| l as usize), cursor).await
    }

    /// Does not require Apple Account. Returns metadata for a single photo file on the device.
    #[napi]
    pub async fn get_photo_info(
        &self,
        udid: String,
        path: String,
    ) -> napi::Result<PhotoInfo> {
        commands::photos::get_photo_info(&udid, &path).await
    }

    /// Does not require Apple Account. Downloads a photo from the device to a local path.
    #[napi]
    pub async fn download_photo(
        &self,
        udid: String,
        remote_path: String,
        local_dest: String,
    ) -> napi::Result<DownloadPhotoResult> {
        commands::photos::download_photo(&udid, &remote_path, &local_dest).await
    }

    /// Does not require Apple Account. Initiates device pairing via lockdownd.
    #[napi]
    pub async fn pair_device(&self, udid: String) -> napi::Result<bool> {
        commands::pairing::pair_device(&udid).await
    }

    /// Does not require Apple Account. Validates an existing device pairing.
    #[napi]
    pub async fn validate_pairing(&self, udid: String) -> napi::Result<bool> {
        commands::pairing::validate_pairing(&udid).await
    }
}

/// List USB-connected devices via usbmuxd. Does not require Apple Account.
#[napi]
pub async fn list_connected_devices() -> napi::Result<Vec<ConnectedDevice>> {
    commands::devices::list_connected().await
}

/// Capture a screenshot from a connected device. Does not require Apple Account.
/// Returns the output path where the screenshot was saved.
#[napi]
pub async fn screenshot(udid: String, output_path: String) -> napi::Result<String> {
    commands::screenshots::screenshot(&udid, &output_path).await
}

/// Launch an app on a connected device via DVT instruments protocol.
/// Returns the PID of the launched process. Does not require Apple Account.
#[napi]
pub async fn launch_app(udid: String, bundle_id: String) -> napi::Result<u32> {
    let pid = commands::launch::launch_app(&udid, &bundle_id).await?;
    Ok(pid as u32)
}

/// Launch an app via DVT instruments with environment variable support.
/// Used for WDA to pass USE_PORT and MJPEG_SERVER_PORT. Does not require Apple Account.
#[napi]
pub async fn launch_app_with_env(
    udid: String,
    bundle_id: String,
    env_vars: Option<std::collections::HashMap<String, String>>,
) -> napi::Result<u32> {
    let pid =
        commands::launch::launch_app_with_env(&udid, &bundle_id, env_vars).await?;
    Ok(pid as u32)
}

/// Start a USB tunnel from a local TCP port to `remote_port` on the device.
/// Returns the local port number. Does not require Apple Account.
/// Call `stop_tunnel` with the returned port to tear it down.
#[napi]
pub async fn start_tunnel(udid: String, remote_port: u32) -> napi::Result<u32> {
    let local = commands::tunnel::start_tunnel(&udid, remote_port as u16).await?;
    Ok(local as u32)
}

/// Stop a tunnel previously started with `start_tunnel`.
#[napi]
pub async fn stop_tunnel(local_port: u32) -> napi::Result<()> {
    commands::tunnel::stop_tunnel(local_port as u16).await
}

/// Start an XCUITest session on a connected device (iOS 17+, cross-platform).
/// Handles testmanagerd protocol, launches the test runner, and starts the test plan.
/// Returns a session ID. The session stays alive until `stop_xcuitest` is called.
/// Does not require Apple Account.
#[napi]
pub async fn start_xcuitest(
    udid: String,
    bundle_id: String,
    test_runner_bundle_id: String,
    env: Option<std::collections::HashMap<String, String>>,
    tunnel_address: Option<String>,
    tunnel_rsd_port: Option<u16>,
) -> napi::Result<u32> {
    commands::xctest::start_xcuitest(
        udid,
        bundle_id,
        test_runner_bundle_id,
        env.unwrap_or_default(),
        tunnel_address,
        tunnel_rsd_port,
    )
    .await
}

/// Stop an XCUITest session previously started with `start_xcuitest`.
#[napi]
pub async fn stop_xcuitest(session_id: u32) -> napi::Result<()> {
    commands::xctest::stop_xcuitest(session_id).await
}

/// List installed apps on a connected device via installation_proxy.
/// `app_type` can be "User", "System", or "Any" (default).
/// Does not require Apple Account.
#[napi]
pub async fn list_installed_apps(
    udid: String,
    app_type: Option<String>,
) -> napi::Result<Vec<commands::apps::InstalledAppInfo>> {
    commands::apps::list_installed_apps(&udid, app_type.as_deref()).await
}
