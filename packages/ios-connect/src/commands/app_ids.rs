use isideload::dev::app_ids::AppIdsApi;
use isideload::dev::teams::TeamsApi;

use crate::session::{self, SessionState};

pub async fn list(
    state: &mut SessionState,
    team_id: Option<&str>,
) -> napi::Result<Vec<serde_json::Value>> {
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

    let response = session
        .list_app_ids(
            &team,
            None::<isideload::dev::device_type::DeveloperDeviceType>,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to list app IDs: {e}")))?;

    Ok(response
        .app_ids
        .iter()
        .map(|a| {
            serde_json::json!({
                "appIdId": a.app_id_id,
                "name": a.name,
                "identifier": a.identifier,
            })
        })
        .collect())
}

pub async fn create(
    state: &mut SessionState,
    bundle_id: &str,
    name: &str,
    team_id: Option<&str>,
) -> napi::Result<serde_json::Value> {
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

    let app_id = session
        .add_app_id(
            &team,
            name,
            bundle_id,
            None::<isideload::dev::device_type::DeveloperDeviceType>,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to create app ID: {e}")))?;

    Ok(serde_json::json!({
        "appIdId": app_id.app_id_id,
        "name": app_id.name,
        "identifier": app_id.identifier,
    }))
}
