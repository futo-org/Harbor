//! Pairing sessions: how a signed-in device authorizes a new one.

use polycentric_common::models::protos_v2::{
    IssuerPairingState, PairingInfo, PairingSessionDigest, PairingSessionState, PublicKey,
    SignedIssuerState,
};
use prost::Message;
use sha2::{Digest, Sha256};

use crate::lock::LockRecover;
use crate::query::event::key::PublicKey as FfiPublicKey;
use crate::sdk::client::Client;
use crate::sdk::error::{SdkError, SdkResult};
use crate::sdk::keys::keys_equal;
use crate::sdk::types::PairingSession;
use crate::time::now_millis;

/// How long a new pairing session lasts.
pub const PAIRING_SESSION_TTL_MILLIS: u64 = 5 * 60 * 1000;

/// Nonce length for a new session digest.
const NONCE_BYTES: usize = 32;

impl Client {
    /// Start a pairing session for the active identity on `server`.
    pub async fn create_pairing_session(&self, server: &str) -> SdkResult<PairingSession> {
        let login = self.require_login()?;
        let mut nonce = vec![0u8; NONCE_BYTES];
        getrandom::fill(&mut nonce).map_err(|e| SdkError::Crypto(e.to_string()))?;
        let digest = PairingSessionDigest {
            issuer_identity: login.id.identity.clone(),
            issuer_signer: Some(login.key_pair.public_key()),
            nonce,
            initial_timestamp: now_millis() as i64,
            ttl_millis: PAIRING_SESSION_TTL_MILLIS as i64,
        };
        let digest_bytes = digest.encode_to_vec();
        let session = self
            .put_pairing_state(server, digest_bytes.clone(), 1)
            .await?;
        self.inner
            .pairing_digests
            .lock_recover()
            .insert(session.pairing_info.digest_sha256.clone(), digest_bytes);
        Ok(session)
    }

    /// Publish a new state (e.g. after authorizing a claimer) for a session
    /// this client created.
    pub async fn update_pairing_session(
        &self,
        info: &PairingInfo,
        sequence: i64,
    ) -> SdkResult<PairingSession> {
        let digest_bytes = self
            .inner
            .pairing_digests
            .lock_recover()
            .get(&info.digest_sha256)
            .cloned()
            .ok_or_else(|| SdkError::NotFound("a pairing session this client created".into()))?;
        self.put_pairing_state(&info.server, digest_bytes, sequence)
            .await
    }

    /// Sign and push the latest identity state for a session we issued.
    async fn put_pairing_state(
        &self,
        server: &str,
        digest_bytes: Vec<u8>,
        sequence: i64,
    ) -> SdkResult<PairingSession> {
        let login = self.require_login()?;
        let digest = PairingSessionDigest::decode(digest_bytes.as_slice())?;
        if digest.issuer_identity != login.id.identity {
            return Err(SdkError::InvalidInput(
                "pairing session is for a different identity than the active one".into(),
            ));
        }
        let signer_matches = digest
            .issuer_signer
            .as_ref()
            .is_some_and(|s| keys_equal(s, &login.key_pair.public_key()));
        if !signer_matches {
            return Err(SdkError::InvalidInput(
                "pairing session pins a different signer than the active key pair".into(),
            ));
        }

        let chain = self.resolve_identity_chain(&digest.issuer_identity)?;
        let identity_state = chain.last().cloned().ok_or_else(|| {
            SdkError::NotFound(format!(
                "no local identity chain for {}",
                digest.issuer_identity
            ))
        })?;

        let state_bytes = IssuerPairingState {
            session_digest: digest_bytes,
            identity_state: Some(identity_state),
            sequence,
        }
        .encode_to_vec();
        let signed = SignedIssuerState {
            signature: login.key_pair.sign(&state_bytes),
            state_bytes,
        };

        let response = self
            .inner
            .core
            .put_pairing_session(server.to_string(), signed.encode_to_vec())
            .await?;
        decode_session(server, &response)
    }

    /// Fetch the session `info` points at.
    pub async fn get_pairing_session(&self, info: &PairingInfo) -> SdkResult<PairingSession> {
        let response = self
            .inner
            .core
            .get_pairing_session(info.server.clone(), info.digest_sha256.clone())
            .await?;
        decode_session(&info.server, &response)
    }

    /// Ask to be paired: register `key` as a claimer on the session.
    pub async fn join_pairing_session(&self, info: &PairingInfo, key: &PublicKey) -> SdkResult<()> {
        Ok(self
            .inner
            .core
            .join_pairing_session(
                info.server.clone(),
                info.digest_sha256.clone(),
                to_ffi_key(key),
            )
            .await?)
    }

    /// Issuer side: the keys asking to be paired.
    pub async fn poll_for_claimers(&self, info: &PairingInfo) -> SdkResult<Vec<PublicKey>> {
        let claimers = self
            .inner
            .core
            .poll_for_claimers(info.server.clone(), info.digest_sha256.clone())
            .await?;
        Ok(claimers.into_iter().map(Into::into).collect())
    }

    /// Claimer side: whether the issuer's latest state authorizes `key`.
    /// Verify the full identity chain before relying on it.
    pub async fn poll_for_authorization(
        &self,
        info: &PairingInfo,
        key: &PublicKey,
    ) -> SdkResult<bool> {
        Ok(self
            .inner
            .core
            .poll_for_authorization(
                info.server.clone(),
                info.digest_sha256.clone(),
                to_ffi_key(key),
            )
            .await?)
    }
}

fn to_ffi_key(key: &PublicKey) -> FfiPublicKey {
    key.clone().into()
}

/// Decode a server's `PairingSessionState`. The engine already checked
/// the signature and digest.
fn decode_session(server: &str, state_bytes: &[u8]) -> SdkResult<PairingSession> {
    let state = PairingSessionState::decode(state_bytes)?;
    let signed = state
        .issuer_state
        .ok_or_else(|| SdkError::Decode("pairing session has no signed issuer state".into()))?;
    let issuer_state = IssuerPairingState::decode(signed.state_bytes.as_slice())?;
    let digest_bytes = issuer_state.session_digest.clone();
    let digest = PairingSessionDigest::decode(digest_bytes.as_slice())?;
    if digest.issuer_signer.is_none() {
        return Err(SdkError::Decode(
            "pairing session digest has no issuer signer".into(),
        ));
    }
    let expires_at_millis =
        (digest.initial_timestamp.max(0) as u64).saturating_add(digest.ttl_millis.max(0) as u64);
    let pairing_info = PairingInfo {
        server: server.to_string(),
        digest_sha256: Sha256::digest(&digest_bytes).to_vec(),
    };
    Ok(PairingSession {
        digest_bytes,
        digest,
        issuer_state,
        claimers: state.claimers,
        expires_at_millis,
        pairing_info,
    })
}
