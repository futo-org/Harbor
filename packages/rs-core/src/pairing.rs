//! Helper functions for identity pairing APIs

use polycentric_common::error::CoreError as CommonError;
use polycentric_common::models::protos_v2::{
    Content, GetPairingSessionRequest, IssuerPairingState, PairingSessionDigest,
    PairingSessionState, PublicKey, content::ContentBody,
    pairing_service_client::PairingServiceClient,
};
use polycentric_common::models::protos_v2::{
    JoinPairingSessionRequest, PutPairingSessionRequest, SignedIssuerState,
};
use prost::Message;
use sha2::{Digest, Sha256};
use std::sync::Mutex;

use crate::api::CoreError;
use crate::client::PolycentricClient;
use crate::lock::LockRecover;
use crate::time;

// ---------- Validation Logic ----------

/// Fields extracted from a server's `PairingSessionState` message after
/// validation.
/// See other docs for where fields originate from and whether they can be
/// trusted.
pub struct SessionState {
    pub digest: PairingSessionDigest,
    pub issuer_state: IssuerPairingState,
    pub claimers: Vec<PublicKey>,
}

#[derive(Default)]
pub struct OpenOptions {
    /// The current time to use for expiration logic.
    /// Leave as `None` to let the validator derive the current time.
    pub now_millis: Option<i64>,

    /// Set this to `true` to skip checking the authorization of the signer.
    /// This is useful when fetching the pairing state for the first time where
    /// we haven't pulled in the issuer's identity chain yet.
    pub skip_signer_auth: bool,

    /// When provided, this value is recorded as an observed sequence for this
    /// pairing session.
    /// It will also be used for checking for rollbacks.
    /// This is useful when pushing a new issuer state and expecting that we
    /// observe it.
    pub min_sequence: Option<i64>,
}

/// Validate the pairing session state and extract its data.
/// The digest is always verified against its expected hash.
/// The signature is always checked against the declared signer.
/// The validation logic can be tuned with `opts`.
pub fn open_state(
    state: PairingSessionState,
    client: &Mutex<PolycentricClient>,
    digest_sha256: &[u8],
    opts: Option<OpenOptions>,
) -> Result<SessionState, CoreError> {
    // Get concrete values for validation options
    let opts = opts.unwrap_or_default();
    let now_millis = opts.now_millis.unwrap_or_else(|| time::now_millis() as i64);
    let check_signer = !opts.skip_signer_auth;
    let min_sequence = opts.min_sequence;

    // Extract issuer state
    let issuer_msg = state
        .issuer_state
        .ok_or_else(|| CoreError::InvalidInput("pairing session has no issuer state".to_owned()))?;

    let (signer, digest, issuer_state) = issuer_msg.open().map_err(|e| match e {
        CommonError::SignatureError(_) => {
            CoreError::InvalidInput("pairing session issuer state signature is invalid".to_owned())
        }
        other => CoreError::Decode(format!("Failed to decode issuer pairing state: {other}")),
    })?;

    // Validate digest
    let derived_sha256 = Sha256::digest(&issuer_state.session_digest);
    if digest_sha256 != derived_sha256.as_slice() {
        return Err(CoreError::InvalidInput(
            "pairing session digest does not match the requested session".to_owned(),
        ));
    }

    // Get what we need from the polycentric client
    let (identity_chain, accept_sequence) = {
        let mut client = client.lock_recover();

        let identity_chain = if check_signer {
            client.identity_chain(&digest.issuer_identity).ok()
        } else {
            None
        };

        if let Some(min_sequence) = min_sequence {
            client.accept_pairing_sequence(digest_sha256, min_sequence);
        }

        let seq = issuer_state.sequence;
        let accept_sequence = client.try_pairing_sequence(digest_sha256, seq);

        (identity_chain, accept_sequence)
    };

    // Validate sequence
    if !accept_sequence {
        return Err(CoreError::InvalidInput(
            "pairing session state sequence is stale".to_owned(),
        ));
    }

    // Validate signer
    if check_signer {
        let identity_state = identity_chain
            .as_ref()
            .and_then(|chain| chain.latest_state())
            .ok_or_else(|| {
                CoreError::InvalidInput(
                    "no valid identity chain for the pairing session issuer".to_owned(),
                )
            })?;

        if !identity_state.authorizes_rotation(&signer) {
            return Err(CoreError::InvalidInput(
                "pairing session signer not authorized for rotation".to_owned(),
            ));
        }
    }

    // Validate liveness
    let expires_at_millis = digest
        .initial_timestamp
        .checked_add(digest.ttl_millis)
        .ok_or_else(|| {
            CoreError::InvalidInput("pairing session expiration overflows".to_owned())
        })?;

    if now_millis > expires_at_millis {
        return Err(CoreError::InvalidInput(
            "pairing session has expired".to_owned(),
        ));
    }

    // Return validated output
    Ok(SessionState {
        digest,
        issuer_state,
        claimers: state.claimers,
    })
}

// ---------- Other Helpers ----------

/// Check if an issuer state authorizes our key.
pub fn does_issuer_authorize(state: &IssuerPairingState, key: &PublicKey) -> bool {
    state
        .identity_state
        .as_ref()
        .and_then(|state| state.serialized_content.as_ref())
        .map(|serialized_content| &serialized_content.content_bytes)
        .and_then(|bytes| Content::decode(bytes.as_slice()).ok())
        .and_then(|content| match content.content_body {
            Some(ContentBody::Identity(document)) => Some(document),
            _ => None,
        })
        .map(|document| document.authorizes_signer(key))
        .unwrap_or(false)
}

// ---------- RPC Wrappers ----------

/// Bare wrapper for a `get_pairing_session` RPC.
/// Does not do any validation of the request or response.
pub async fn fetch_session(
    server_url: &str,
    digest_sha256: Vec<u8>,
) -> Result<PairingSessionState, CoreError> {
    let channel = crate::query::channel(server_url)
        .await
        .map_err(CoreError::Network)?;

    let response = PairingServiceClient::new(channel)
        .get_pairing_session(GetPairingSessionRequest { digest_sha256 })
        .await
        .map_err(|e| CoreError::Network(format!("get_pairing_session: {e}")))?;

    response
        .into_inner()
        .session_state
        .ok_or_else(|| CoreError::Network("get_pairing_session: missing session state".into()))
}

/// Fetch the pairing session, but don't check the signer's authorization.
pub async fn fetch_session_dangerous(
    client: &Mutex<PolycentricClient>,
    server_url: &str,
    digest_sha256: Vec<u8>,
) -> Result<Vec<u8>, CoreError> {
    let session_state = fetch_session(server_url, digest_sha256.clone()).await?;

    let bytes = session_state.encode_to_vec();
    open_state(
        session_state,
        client,
        &digest_sha256,
        Some(OpenOptions {
            skip_signer_auth: true,
            ..OpenOptions::default()
        }),
    )?;

    Ok(bytes)
}

/// Create or update a pairing session's state on the server.
pub async fn put(
    client: &Mutex<PolycentricClient>,
    server_url: &str,
    signed_issuer_state: Vec<u8>,
) -> Result<Vec<u8>, CoreError> {
    // Extract what we need from the caller's request
    let signed = SignedIssuerState::decode(signed_issuer_state.as_slice())
        .map_err(|e| CoreError::Decode(format!("Failed to decode SignedIssuerState: {e}")))?;

    let issuer_state = IssuerPairingState::decode(signed.state_bytes.as_slice())
        .map_err(|e| CoreError::Decode(format!("Failed to decode IssuerPairingState: {e}")))?;

    let digest_sha256 = Sha256::digest(&issuer_state.session_digest);

    // Send out the request
    let channel = crate::query::channel(server_url)
        .await
        .map_err(CoreError::Network)?;

    let mut rpc_client = PairingServiceClient::new(channel);

    let response = rpc_client
        .put_pairing_session(PutPairingSessionRequest {
            issuer_state: Some(signed),
        })
        .await
        .map_err(|e| CoreError::Network(format!("put_pairing_session: {e}")))?;

    // Check that the response is what we want
    let response_state = response
        .into_inner()
        .session_state
        .ok_or_else(|| CoreError::Network("put_pairing_session: missing session state".into()))?;

    // It's possible for the server to mess with the state or for our session
    // to have been superseded by a newer one.
    // Let's make sure we got a valid response that matches what we sent.
    let bytes = response_state.encode_to_vec();
    open_state(
        response_state,
        client,
        &digest_sha256,
        Some(OpenOptions {
            min_sequence: Some(issuer_state.sequence),
            ..OpenOptions::default()
        }),
    )?;

    Ok(bytes)
}

pub async fn join(
    client: &Mutex<PolycentricClient>,
    server_url: String,
    digest_sha256: Vec<u8>,
    claimer_key: PublicKey,
) -> Result<(), CoreError> {
    let channel = crate::query::channel(&server_url)
        .await
        .map_err(CoreError::Network)?;

    let mut rpc_client = PairingServiceClient::new(channel);

    let response = rpc_client
        .join_pairing_session(JoinPairingSessionRequest {
            digest_sha256: digest_sha256.clone(),
            claimer_key: Some(claimer_key.clone()),
        })
        .await
        .map_err(|e| CoreError::Network(format!("join_pairing_session: {e}")))?;

    let session_state = response
        .into_inner()
        .session_state
        .ok_or_else(|| CoreError::Network("join_pairing_session: missing session state".into()))?;

    let state = open_state(session_state, client, &digest_sha256, None)?;
    if !state.claimers.contains(&claimer_key) {
        return Err(CoreError::InvalidInput(
            "claimer key is not registered on the pairing session".to_owned(),
        ));
    }

    Ok(())
}
