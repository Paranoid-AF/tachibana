use serde_json::json;

use isideload::dev::teams::TeamsApi;

use crate::ipc;
use crate::session::SessionState;

pub async fn list(state: &mut SessionState, id: &str) {
    let session = match state.dev_session.as_mut() {
        Some(s) => s,
        None => {
            ipc::send_error(id, "AUTH_REQUIRED", "Not logged in. Call 'login' first.");
            return;
        }
    };

    match session.list_teams().await {
        Ok(teams) => {
            let teams_json: Vec<_> = teams
                .iter()
                .map(|t| {
                    json!({
                        "teamId": t.team_id,
                        "name": t.name,
                        "type": t.r#type,
                        "status": t.status,
                    })
                })
                .collect();
            ipc::send_success(id, json!({ "teams": teams_json }));
        }
        Err(e) => {
            ipc::send_error(id, "TEAM_ERROR", &format!("Failed to list teams: {e}"));
        }
    }
}
