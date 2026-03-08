use std::sync::Arc;

use isideload::anisette::remote_v3::RemoteV3AnisetteProvider;
use isideload::auth::apple_account::AppleAccount;
use isideload::dev::developer_session::DeveloperSession;
use napi::bindgen_prelude::Promise;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction};
use tokio::sync::Mutex;

use crate::session::SessionState;
use crate::types::{SessionInfo, TwoFaInfo};

/// Login to Apple ID. `two_fa_callback` is a JS async function that receives
/// `{ type: "trustedDevice" }` and must return a Promise resolving to the 6-digit code.
pub async fn login(
    state: Arc<Mutex<SessionState>>,
    email: String,
    password: String,
    two_fa_callback: ThreadsafeFunction<TwoFaInfo, ErrorStrategy::CalleeHandled>,
) -> napi::Result<()> {
    let anisette_url = {
        let st = state.lock().await;
        st.anisette_url.clone()
    };

    let anisette = match anisette_url {
        Some(url) => RemoteV3AnisetteProvider::default().set_url(&url),
        None => RemoteV3AnisetteProvider::default(),
    };

    let mut account = AppleAccount::builder(&email)
        .anisette_provider(anisette)
        .build()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to create account: {e}")))?;

    // isideload calls this sync closure when 2FA is needed.
    // We call the JS ThreadsafeFunction and block until its Promise<string> resolves.
    let two_fa_fn = move || -> Option<String> {
        let info = TwoFaInfo { r#type: "trustedDevice".to_string() };
        tokio::runtime::Handle::current().block_on(async {
            two_fa_callback
                .call_async::<Promise<String>>(Ok(info))
                .await
                .ok()?
                .await
                .ok()
        })
    };

    account
        .login(&password, two_fa_fn)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Login failed: {e}")))?;

    let dev_session = DeveloperSession::from_account(&mut account)
        .await
        .map_err(|e| {
            napi::Error::from_reason(format!(
                "Login succeeded but failed to create developer session: {e}"
            ))
        })?;

    let mut st = state.lock().await;
    st.account = Some(account);
    st.dev_session = Some(dev_session);

    Ok(())
}

pub fn get_session_info(state: &SessionState) -> napi::Result<SessionInfo> {
    let email = state
        .account
        .as_ref()
        .map(|a: &AppleAccount| a.email.clone());

    Ok(SessionInfo {
        logged_in: state.is_logged_in(),
        email,
    })
}
