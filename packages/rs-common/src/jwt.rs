//! Verification of the JWTs clients mint to authenticate against a server
//! (see js-core's `createServerJwt`). EdDSA over `header.claims`, signing
//! key carried as hex in the header's `kid`.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Deserialize;

use crate::signing::verify_signature;

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum JwtError {
    #[error("malformed token")]
    Malformed,
    #[error("unsupported algorithm")]
    UnsupportedAlgorithm,
    #[error("signature verification failed")]
    Signature,
    #[error("token has expired")]
    Expired,
    #[error("token is for a different audience")]
    Audience,
}

#[derive(Debug, Deserialize)]
struct Header {
    alg: String,
    /// Hex-encoded ed25519 public key that signed the token.
    kid: String,
}

#[derive(Debug, Deserialize)]
pub struct ServerJwtClaims {
    /// The identity authenticating (its identity key).
    pub iss: String,
    /// The server the token authenticates against.
    pub aud: String,
    pub iat: u64,
    pub exp: u64,
}

/// A token with a valid signature. Callers must still [`validate`] the
/// claims and check `signed_by` against the issuer's identity document.
///
/// [`validate`]: VerifiedJwt::validate
pub struct VerifiedJwt {
    pub claims: ServerJwtClaims,
    /// The ed25519 public key (the header's `kid`) that signed the token.
    pub signed_by: Vec<u8>,
}

impl VerifiedJwt {
    /// Check the token is for one of `allowed_audiences` and not expired
    /// at `now` (unix seconds).
    pub fn validate(&self, allowed_audiences: &[String], now: u64) -> Result<(), JwtError> {
        if !allowed_audiences.contains(&self.claims.aud) {
            return Err(JwtError::Audience);
        }
        if now >= self.claims.exp {
            return Err(JwtError::Expired);
        }
        Ok(())
    }
}

/// Decode `token` and verify its signature against the key in its header.
pub fn verify_jwt(token: &str) -> Result<VerifiedJwt, JwtError> {
    let mut segments = token.split('.');
    let (Some(header_b64), Some(claims_b64), Some(signature_b64), None) = (
        segments.next(),
        segments.next(),
        segments.next(),
        segments.next(),
    ) else {
        return Err(JwtError::Malformed);
    };

    let header: Header = decode_segment(header_b64)?;
    if header.alg != "EdDSA" {
        return Err(JwtError::UnsupportedAlgorithm);
    }
    let signed_by = hex::decode(&header.kid).map_err(|_| JwtError::Malformed)?;

    let signature = URL_SAFE_NO_PAD
        .decode(signature_b64)
        .map_err(|_| JwtError::Malformed)?;
    let signing_input = format!("{header_b64}.{claims_b64}");
    verify_signature(&signed_by, &signature, signing_input.as_bytes())
        .map_err(|_| JwtError::Signature)?;

    Ok(VerifiedJwt {
        claims: decode_segment(claims_b64)?,
        signed_by,
    })
}

/// A base64url JWT segment as JSON.
fn decode_segment<T: for<'a> Deserialize<'a>>(segment: &str) -> Result<T, JwtError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(segment)
        .map_err(|_| JwtError::Malformed)?;
    serde_json::from_slice(&bytes).map_err(|_| JwtError::Malformed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    const IDENTITY: &str = "identity-key-hex";
    const SERVER: &str = "https://server.example.com";

    fn signing_key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    /// Mint a token matching js-core's `createServerJwt` format.
    fn mint(alg: &str, kid: &str, exp: u64) -> String {
        let header = format!(r#"{{"alg":"{alg}","typ":"JWT","kid":"{kid}"}}"#);
        let claims = format!(r#"{{"iss":"{IDENTITY}","aud":"{SERVER}","iat":1000,"exp":{exp}}}"#);
        let signing_input = format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(header),
            URL_SAFE_NO_PAD.encode(claims)
        );
        let signature = signing_key().sign(signing_input.as_bytes());
        format!(
            "{signing_input}.{}",
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        )
    }

    fn kid() -> String {
        let bytes = signing_key().verifying_key().to_bytes();
        hex::encode(bytes)
    }

    #[test]
    fn verifies_a_valid_token() {
        let verified = mint_and_verify().expect("token should verify");
        assert_eq!(verified.claims.iss, IDENTITY);
        assert_eq!(verified.claims.aud, SERVER);
        assert_eq!(verified.signed_by, signing_key().verifying_key().to_bytes());
        assert!(verified.validate(&[SERVER.to_string()], 1500).is_ok());
    }

    fn mint_and_verify() -> Result<VerifiedJwt, JwtError> {
        verify_jwt(&mint("EdDSA", &kid(), 2000))
    }

    #[test]
    fn rejects_a_tampered_token() {
        let token = mint("EdDSA", &kid(), 2000);
        let forged_claims = URL_SAFE_NO_PAD.encode(format!(
            r#"{{"iss":"{IDENTITY}","aud":"{SERVER}","iat":1000,"exp":9999}}"#
        ));
        let mut segments: Vec<&str> = token.split('.').collect();
        segments[1] = &forged_claims;
        assert_eq!(
            verify_jwt(&segments.join(".")).err(),
            Some(JwtError::Signature)
        );
    }

    #[test]
    fn rejects_a_key_that_did_not_sign() {
        let other_kid: String = hex::encode(
            SigningKey::from_bytes(&[8u8; 32])
                .verifying_key()
                .to_bytes(),
        );
        assert_eq!(
            verify_jwt(&mint("EdDSA", &other_kid, 2000)).err(),
            Some(JwtError::Signature)
        );
    }

    #[test]
    fn rejects_other_algorithms() {
        assert_eq!(
            verify_jwt(&mint("HS256", &kid(), 2000)).err(),
            Some(JwtError::UnsupportedAlgorithm)
        );
    }

    #[test]
    fn rejects_garbage() {
        assert_eq!(verify_jwt("not-a-token").err(), Some(JwtError::Malformed));
        assert_eq!(verify_jwt("a.b.c.d").err(), Some(JwtError::Malformed));
    }

    #[test]
    fn validate_rejects_the_wrong_audience_and_expiry() {
        let verified = mint_and_verify().unwrap();
        let allowed = [SERVER.to_string()];
        assert_eq!(
            verified
                .validate(&["https://other.example.com".to_string()], 1500)
                .err(),
            Some(JwtError::Audience)
        );
        assert_eq!(
            verified.validate(&allowed, 2000).err(),
            Some(JwtError::Expired)
        );
        assert!(verified.validate(&allowed, 1999).is_ok());
    }

    #[test]
    fn validate_accepts_any_allowed_audience() {
        let verified = mint_and_verify().unwrap();
        let allowed = ["https://other.example.com".to_string(), SERVER.to_string()];
        assert!(verified.validate(&allowed, 1500).is_ok());
    }
}
