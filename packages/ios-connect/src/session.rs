use std::path::PathBuf;

use isideload::auth::apple_account::AppleAccount;
use isideload::dev::developer_session::DeveloperSession;
use isideload::dev::teams::DeveloperTeam;
use isideload::util::fs_storage::FsStorage;
use tokio::sync::oneshot;

use crate::types::SessionData;

/// Holds all session state for the addon lifetime.
pub struct SessionState {
    pub account: Option<AppleAccount>,
    pub dev_session: Option<DeveloperSession>,
    /// Email carried over when session is restored from a persisted token (account is None).
    pub persisted_email: Option<String>,
    pub data_dir: PathBuf,
    pub anisette_url: Option<String>,
    /// Sender half of the 2FA oneshot channel. Set when 2FA is required during login;
    /// consumed by `submit_two_fa` to deliver the verification code.
    pub two_fa_tx: Option<oneshot::Sender<String>>,
    /// Cached session token data, populated during login or restore for external persistence.
    pub cached_session_data: Option<SessionData>,
}

impl SessionState {
    pub fn new(data_dir: PathBuf, anisette_url: Option<String>) -> Self {
        Self {
            account: None,
            dev_session: None,
            persisted_email: None,
            data_dir,
            anisette_url,
            two_fa_tx: None,
            cached_session_data: None,
        }
    }

    /// Create a FsStorage for isideload's signing identity persistence.
    pub fn storage(&self) -> Box<FsStorage> {
        let storage_dir = self.data_dir.join("isideload");
        std::fs::create_dir_all(&storage_dir).ok();
        Box::new(FsStorage::new(storage_dir))
    }

    /// Check if we have an active developer session.
    pub fn is_logged_in(&self) -> bool {
        self.dev_session.is_some()
    }
}

/// Select a team by ID if provided, otherwise pick the first one.
pub fn select_team(teams: Vec<DeveloperTeam>, team_id: Option<&str>) -> Option<DeveloperTeam> {
    match team_id {
        Some(id) => teams.into_iter().find(|t| t.team_id == id),
        None => teams.into_iter().next(),
    }
}
