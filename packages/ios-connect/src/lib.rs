use std::path::PathBuf;
use std::sync::Arc;

use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction};
use napi_derive::napi;
use tokio::sync::Mutex;

mod commands;
mod session;

use session::SessionState;

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
        two_fa_callback: ThreadsafeFunction<serde_json::Value, ErrorStrategy::CalleeHandled>,
    ) -> napi::Result<()> {
        commands::auth::login(self.state.clone(), email, password, two_fa_callback).await
    }

    #[napi]
    pub async fn get_session_info(&self) -> napi::Result<serde_json::Value> {
        let state = self.state.lock().await;
        commands::auth::get_session_info(&state)
    }

    #[napi]
    pub async fn list_teams(&self) -> napi::Result<Vec<serde_json::Value>> {
        let mut state = self.state.lock().await;
        commands::teams::list(&mut state).await
    }

    #[napi]
    pub async fn list_certs(
        &self,
        team_id: Option<String>,
    ) -> napi::Result<Vec<serde_json::Value>> {
        let mut state = self.state.lock().await;
        commands::certs::list(&mut state, team_id.as_deref()).await
    }

    #[napi]
    pub async fn revoke_cert(
        &self,
        serial_number: String,
        team_id: Option<String>,
    ) -> napi::Result<()> {
        let mut state = self.state.lock().await;
        commands::certs::revoke(&mut state, &serial_number, team_id.as_deref()).await
    }

    #[napi]
    pub async fn list_app_ids(
        &self,
        team_id: Option<String>,
    ) -> napi::Result<Vec<serde_json::Value>> {
        let mut state = self.state.lock().await;
        commands::app_ids::list(&mut state, team_id.as_deref()).await
    }

    #[napi]
    pub async fn create_app_id(
        &self,
        bundle_id: String,
        name: String,
        team_id: Option<String>,
    ) -> napi::Result<serde_json::Value> {
        let mut state = self.state.lock().await;
        commands::app_ids::create(&mut state, &bundle_id, &name, team_id.as_deref()).await
    }

    #[napi]
    pub async fn list_devices(
        &self,
        team_id: Option<String>,
    ) -> napi::Result<Vec<serde_json::Value>> {
        let mut state = self.state.lock().await;
        commands::devices::list(&mut state, team_id.as_deref()).await
    }

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

    #[napi]
    pub async fn sign_app(
        &self,
        app_path: String,
        team_id: Option<String>,
    ) -> napi::Result<String> {
        let mut state = self.state.lock().await;
        commands::sideload::sign(&mut state, &app_path, team_id.as_deref()).await
    }

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

    #[napi]
    pub async fn list_photos(
        &self,
        udid: String,
        limit: Option<u32>,
        cursor: Option<String>,
    ) -> napi::Result<serde_json::Value> {
        commands::photos::list_photos(&udid, limit.map(|l| l as usize), cursor).await
    }

    #[napi]
    pub async fn get_photo_info(
        &self,
        udid: String,
        path: String,
    ) -> napi::Result<serde_json::Value> {
        commands::photos::get_photo_info(&udid, &path).await
    }

    #[napi]
    pub async fn download_photo(
        &self,
        udid: String,
        remote_path: String,
        local_dest: String,
    ) -> napi::Result<serde_json::Value> {
        commands::photos::download_photo(&udid, &remote_path, &local_dest).await
    }

    #[napi]
    pub async fn pair_device(&self, udid: String) -> napi::Result<bool> {
        commands::pairing::pair_device(&udid).await
    }

    #[napi]
    pub async fn validate_pairing(&self, udid: String) -> napi::Result<bool> {
        commands::pairing::validate_pairing(&udid).await
    }
}

/// List USB-connected devices via usbmuxd. Does not require Apple auth.
#[napi]
pub async fn list_connected_devices() -> napi::Result<Vec<serde_json::Value>> {
    commands::devices::list_connected().await
}

/// Capture a screenshot from a connected device. Does not require Apple auth.
/// Returns the output path where the screenshot was saved.
#[napi]
pub async fn screenshot(udid: String, output_path: String) -> napi::Result<String> {
    commands::screenshots::screenshot(&udid, &output_path).await
}
