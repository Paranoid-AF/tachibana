use isideload::dev::teams::TeamsApi;

use crate::session::SessionState;
use crate::types::Team;

pub async fn list(state: &mut SessionState) -> napi::Result<Vec<Team>> {
    let session = state
        .dev_session
        .as_mut()
        .ok_or_else(|| napi::Error::from_reason("Not logged in. Call 'login' first."))?;

    let teams = session
        .list_teams()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to list teams: {e}")))?;

    Ok(teams
        .iter()
        .map(|t| Team {
            team_id: t.team_id.clone(),
            name: t.name.clone().unwrap_or_default(),
            r#type: t.r#type.clone().unwrap_or_default(),
            status: t.status.clone().unwrap_or_default(),
        })
        .collect())
}
