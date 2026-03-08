use std::sync::Arc;

use isideload::anisette::remote_v3::RemoteV3AnisetteProvider;
use isideload::anisette::AnisetteDataGenerator;
use isideload::auth::apple_account::{AppToken, AppleAccount};
use isideload::auth::grandslam::GrandSlam;
use isideload::dev::developer_session::DeveloperSession;
use isideload::util::plist::PlistDataExtract;
use isideload::SideloadError;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use tokio::sync::{oneshot, Mutex, RwLock};

use crate::session::SessionState;
use crate::types::{SessionData, SessionInfo, TwoFaInfo};

/// Extracts a human-readable message from an isideload error report.
/// Walks the report chain to find the `SideloadError::AuthWithMessage` variant
/// and returns just the Apple-provided message string, avoiding raw error chains
/// with internal file paths.
fn auth_error_message(e: &rootcause::Report) -> String {
    e.iter_reports()
        .find_map(|node| node.downcast_current_context::<SideloadError>())
        .map(|se| match se {
            SideloadError::AuthWithMessage(_, msg) => msg.clone(),
            other => other.to_string(),
        })
        .unwrap_or_else(|| e.to_string())
}

/// Login to Apple ID. `two_fa_callback` is called (fire-and-forget) when 2FA is required.
/// The caller must then invoke `submit_two_fa` with the verification code to continue login.
pub async fn login(
    state: Arc<Mutex<SessionState>>,
    email: String,
    password: String,
    two_fa_callback: ThreadsafeFunction<TwoFaInfo, ErrorStrategy::Fatal>,
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

    // isideload calls this sync closure when 2FA is required.
    // We store a oneshot sender in session state, notify JS (fire-and-forget),
    // then block until submit_two_fa() delivers the code through the channel.
    let state_ref = state.clone();
    let two_fa_fn = move || -> Option<String> {
        let (tx, rx) = oneshot::channel::<String>();

        // Store sender so submit_two_fa() can deliver the code
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                state_ref.lock().await.two_fa_tx = Some(tx);
            })
        });

        // Notify JS — fire and forget, does not block
        let info = TwoFaInfo { r#type: "trustedDevice".to_string() };
        two_fa_callback.call(info, ThreadsafeFunctionCallMode::NonBlocking);

        // Block until submit_two_fa() sends the code through the channel
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(rx).ok()
        })
    };

    account
        .login(&password, two_fa_fn)
        .await
        .map_err(|e| napi::Error::from_reason(auth_error_message(&e)))?;

    // Cache session data before DeveloperSession::from_account consumes the token flow.
    let cached = build_session_data(&mut account).await?;

    let dev_session = DeveloperSession::from_account(&mut account)
        .await
        .map_err(|e| napi::Error::from_reason(auth_error_message(&e)))?;

    let mut st = state.lock().await;
    st.account = Some(account);
    st.dev_session = Some(dev_session);
    st.cached_session_data = Some(cached);

    Ok(())
}

/// Extracts token and adsid from an AppleAccount immediately after login.
async fn build_session_data(account: &mut AppleAccount) -> napi::Result<SessionData> {
    let token = account
        .get_app_token("xcode.auth")
        .await
        .map_err(|e| napi::Error::from_reason(auth_error_message(&e)))?;
    let adsid = account
        .spd
        .as_ref()
        .ok_or_else(|| napi::Error::from_reason("SPD not available".to_string()))?
        .get_string("adsid")
        .map_err(|e| napi::Error::from_reason(format!("Failed to get adsid: {e}")))?;
    Ok(SessionData {
        email: account.email.clone(),
        token: token.token,
        duration: token.duration as u32,
        expiry: token.expiry as u32,
        adsid,
    })
}

pub fn get_session_info(state: &SessionState) -> napi::Result<SessionInfo> {
    let email = state
        .account
        .as_ref()
        .map(|a: &AppleAccount| a.email.clone())
        .or_else(|| state.persisted_email.clone());

    Ok(SessionInfo {
        logged_in: state.is_logged_in(),
        email,
    })
}

/// Returns the cached session token data for external persistence.
/// Populated during login or restore; returns None if not yet logged in.
pub async fn get_session_data(state: Arc<Mutex<SessionState>>) -> napi::Result<Option<SessionData>> {
    let st = state.lock().await;
    Ok(st.cached_session_data.clone())
}

/// Clears the in-memory session state (does not touch persisted storage).
pub async fn logout(state: Arc<Mutex<SessionState>>) -> napi::Result<()> {
    let mut st = state.lock().await;
    st.dev_session = None;
    st.account = None;
    st.persisted_email = None;
    st.cached_session_data = None;
    Ok(())
}

/// Delivers the 2FA verification code to the blocked `login` call.
/// Must be called after receiving a `twoFaCallback` notification.
pub async fn submit_two_fa(state: Arc<Mutex<SessionState>>, code: String) -> napi::Result<()> {
    let mut st = state.lock().await;
    if let Some(tx) = st.two_fa_tx.take() {
        tx.send(code).map_err(|_| napi::Error::from_reason("2FA channel closed"))?;
        Ok(())
    } else {
        Err(napi::Error::from_reason("No pending 2FA"))
    }
}

/// Restores a developer session from externally persisted token data.
pub async fn restore_session(state: Arc<Mutex<SessionState>>, data: SessionData) -> napi::Result<bool> {
    let anisette_url = {
        let st = state.lock().await;
        st.anisette_url.clone()
    };

    let anisette = match anisette_url {
        Some(url) => RemoteV3AnisetteProvider::default().set_url(&url),
        None => RemoteV3AnisetteProvider::default(),
    };

    let anisette_generator = AnisetteDataGenerator::new(Arc::new(RwLock::new(anisette)));

    let client_info = anisette_generator
        .get_client_info()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get anisette client info: {e}")))?;

    let grandslam = GrandSlam::new(client_info, false)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to create GrandSlam client: {e}")))?;

    let dev_session = DeveloperSession::new(
        AppToken { token: data.token.clone(), duration: data.duration as u64, expiry: data.expiry as u64 },
        data.adsid.clone(),
        Arc::new(grandslam),
        anisette_generator,
    );

    let mut st = state.lock().await;
    st.dev_session = Some(dev_session);
    st.persisted_email = Some(data.email.clone());
    st.cached_session_data = Some(data);

    Ok(true)
}
