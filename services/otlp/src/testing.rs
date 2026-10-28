//! Helpers shared by the unit tests.

use std::sync::Arc;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ed25519_dalek::{Signer, SigningKey};
use polycentric_common::models::protos_v2::PublicKey;

use crate::config::Config;
use crate::identity::Identities;
use crate::routes::AppState;

pub const AUD: &str = "https://otlp.test";
pub const ISS: &str = "identity-1";

pub fn signing_key() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}

pub fn signing_key_hex() -> String {
    hex::encode(signing_key().verifying_key().to_bytes())
}

/// Mint a token matching js-core's `createServerJwt` format.
pub fn mint(key: &SigningKey, iss: &str, aud: &str, exp: u64) -> String {
    let kid = hex::encode(key.verifying_key().to_bytes());
    let header = format!(r#"{{"alg":"EdDSA","typ":"JWT","kid":"{kid}"}}"#);
    let claims = format!(r#"{{"iss":"{iss}","aud":"{aud}","iat":0,"exp":{exp}}}"#);
    let signing_input = format!(
        "{}.{}",
        URL_SAFE_NO_PAD.encode(header),
        URL_SAFE_NO_PAD.encode(claims)
    );
    let signature = key.sign(signing_input.as_bytes());
    format!(
        "{signing_input}.{}",
        URL_SAFE_NO_PAD.encode(signature.to_bytes())
    )
}

/// Authorizes only [`signing_key`] for [`ISS`], or fails every lookup.
pub struct StubIdentities {
    pub failing: bool,
}

#[tonic::async_trait]
impl Identities for StubIdentities {
    async fn authorizes(&self, identity: &str, signer: &PublicKey) -> Result<bool, String> {
        if self.failing {
            return Err("servers down".to_string());
        }
        Ok(identity == ISS && signer.key == signing_key().verifying_key().to_bytes())
    }
}

pub fn config(logs_url: Option<String>, traces_url: Option<String>) -> &'static Config {
    Box::leak(Box::new(Config {
        addr: "127.0.0.1:0".parse().unwrap(),
        allow_hosts: vec![AUD.to_string()],
        query_servers: vec![],
        victoria_logs_url: logs_url,
        victoria_traces_url: traces_url,
        max_body_bytes: 1024 * 1024,
    }))
}

pub fn state(logs_url: Option<String>, traces_url: Option<String>) -> AppState {
    AppState {
        config: config(logs_url, traces_url),
        http: reqwest::Client::new(),
        identities: Arc::new(StubIdentities { failing: false }),
    }
}
