use isideload::dev::teams::TeamsApi;

use crate::session::SessionState;

pub async fn list(state: &mut SessionState) -> napi::Result<Vec<serde_json::Value>> {
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
        .map(|t| {
            serde_json::json!({
                "teamId": t.team_id,
                "name": t.name,
                "type": t.r#type,
                "status": t.status,
            })
        })
        .collect())
}
