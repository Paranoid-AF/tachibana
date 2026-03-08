use isideload::dev::certificates::CertificatesApi;
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

    let certs = session
        .list_all_development_certs(
            &team,
            None::<isideload::dev::device_type::DeveloperDeviceType>,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to list certificates: {e}")))?;

    Ok(certs
        .iter()
        .map(|c| {
            serde_json::json!({
                "serialNumber": c.serial_number,
                "name": c.machine_name,
                "expirationDate": c.expiration_date.as_ref().map(|d| format!("{d:?}")),
            })
        })
        .collect())
}

pub async fn revoke(
    state: &mut SessionState,
    serial_number: &str,
    team_id: Option<&str>,
) -> napi::Result<()> {
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

    session
        .revoke_development_cert(
            &team,
            serial_number,
            None::<isideload::dev::device_type::DeveloperDeviceType>,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to revoke certificate: {e}")))?;

    Ok(())
}
