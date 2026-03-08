use std::path::PathBuf;

use isideload::auth::apple_account::AppleAccount;
use isideload::dev::developer_session::DeveloperSession;
use isideload::dev::teams::DeveloperTeam;
use isideload::util::fs_storage::FsStorage;

/// Holds all session state for the addon lifetime.
pub struct SessionState {
    pub account: Option<AppleAccount>,
    pub dev_session: Option<DeveloperSession>,
    pub data_dir: PathBuf,
    pub anisette_url: Option<String>,
}

impl SessionState {
    pub fn new(data_dir: PathBuf, anisette_url: Option<String>) -> Self {
        Self {
            account: None,
            dev_session: None,
            data_dir,
            anisette_url,
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
