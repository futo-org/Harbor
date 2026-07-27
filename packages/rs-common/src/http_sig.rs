//! Hand-rolled request signing shared by the client (rs-core) and the
//! server. All auth material travels in gRPC metadata:
//!
//! - `polycentric-content-digest`: `sha-256=:<base64(sha256(message))>:`
//!   over the encoded request message
//! - `polycentric-signature-input`: the signed params line ([`SigParams`])
//! - `polycentric-public-key`: base64 of the signer's raw ed25519 key
//! - `polycentric-signature`: base64 ed25519 signature over
//!   [`signature_base`]
//!
//! [`verify_signed_request`] is the single verifier entry point: given
//! the request headers it checks shape and freshness, verifies the
//! signature, and returns the verified signer key. It is pure and
//! synchronous; two checks intentionally stay with the caller:
//!
//! - **Body binding**: this module trusts the content-digest header.
//!   Transport middleware in front of the service MUST verify that the
//!   header matches the actual received body (and reject otherwise).
//! - **Key authentication**: the signature proves possession of the
//!   returned key, not that the key speaks for the claimed `keyid`. The
//!   caller must authenticate the key against the identity's authorized
//!   keys (a database concern) before trusting the identity.
//!
//! Both ends build the signed bytes with [`signature_base`] from the
//! *literal* header strings, so there is no canonicalization drift. The
//! base covers the operation (binds the signature to one RPC), the
//! server's canonical authority (anti-relay), the content-digest header
//! (body binding), and the params line (which binds `created`,
//! `expires`, `keyid`, and `nonce`).

use base64::Engine as _;
use sha2::{Digest as _, Sha256};
use std::fmt;
use tonic::metadata::MetadataMap;

/// Metadata key carrying the content digest of the encoded request
/// message ([`content_digest`]).
pub const META_CONTENT_DIGEST: &str = "polycentric-content-digest";
/// Metadata key carrying the signed params line ([`SigParams::to_header_value`]).
pub const META_SIGNATURE_INPUT: &str = "polycentric-signature-input";
/// Metadata key carrying the base64 raw ed25519 public key of the signer.
pub const META_PUBLIC_KEY: &str = "polycentric-public-key";
/// Metadata key carrying the base64 ed25519 signature over [`signature_base`].
pub const META_SIGNATURE: &str = "polycentric-signature";

/// The only scheme version currently understood. Version 1 is
/// ed25519-only, so no algorithm negotiation exists anywhere.
pub const SCHEME_VERSION: u8 = 1;

/// Accepted difference between a signed timestamp and the verifier's
/// clock, absorbing clock drift between client and server.
const CLOCK_SKEW_MS: i64 = 30 * 60 * 1000;

/// Longest signature validity window (`expires - created`) accepted,
/// bounding how long a captured signature stays usable.
const MAX_TTL_MS: i64 = 30 * 60 * 1000;

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

#[derive(Debug, PartialEq, Eq)]
pub enum HttpSigError {
    /// The `polycentric-content-digest` metadata was absent.
    MissingContentDigest,
    /// The `polycentric-signature-input` metadata was absent.
    MissingSignatureInput,
    /// The `polycentric-public-key` metadata was absent.
    MissingPublicKey,
    /// The `polycentric-signature` metadata was absent.
    MissingSignature,
    /// A `polycentric-signature-input` field was missing or malformed.
    MalformedSignatureInput,
    /// The public key metadata was not valid base64.
    MalformedPublicKey,
    /// The signature metadata was not valid base64.
    MalformedSignature,
    /// Scheme version is absent or not [`SCHEME_VERSION`].
    UnsupportedVersion,
    /// A lone timestamp is outside the accepted clock-skew window.
    TimestampSkew,
    /// `now` is past `expires` (beyond skew tolerance).
    Expired,
    /// `created` is in the future (beyond skew tolerance).
    NotYetValid,
    /// `expires - created` exceeds the longest accepted validity window
    /// (or is negative).
    ValidityWindowTooLong,
    /// The signature did not verify against the presented public key.
    InvalidSignature,
}

impl fmt::Display for HttpSigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HttpSigError::MissingContentDigest => {
                write!(f, "missing content-digest")
            }
            HttpSigError::MissingSignatureInput => {
                write!(f, "missing signature-input")
            }
            HttpSigError::MissingPublicKey => write!(f, "missing public key"),
            HttpSigError::MissingSignature => write!(f, "missing signature"),
            HttpSigError::MalformedSignatureInput => {
                write!(f, "malformed signature-input")
            }
            HttpSigError::MalformedPublicKey => {
                write!(f, "public key is not valid base64")
            }
            HttpSigError::MalformedSignature => {
                write!(f, "signature is not valid base64")
            }
            HttpSigError::UnsupportedVersion => {
                write!(f, "unsupported signature scheme version")
            }
            HttpSigError::TimestampSkew => {
                write!(f, "timestamp outside acceptable skew window")
            }
            HttpSigError::Expired => write!(f, "signature expired"),
            HttpSigError::NotYetValid => write!(f, "signature not yet valid"),
            HttpSigError::ValidityWindowTooLong => {
                write!(f, "signature validity window too long")
            }
            HttpSigError::InvalidSignature => write!(f, "invalid signature"),
        }
    }
}

impl std::error::Error for HttpSigError {}

/// Map a signature-validation failure onto the gRPC status taxonomy:
/// absent or stale credentials and failed signatures are
/// `unauthenticated`; malformed inputs are `invalid_argument`.
impl From<HttpSigError> for tonic::Status {
    fn from(e: HttpSigError) -> tonic::Status {
        match e {
            HttpSigError::MissingContentDigest
            | HttpSigError::MissingSignatureInput
            | HttpSigError::MissingPublicKey
            | HttpSigError::MissingSignature
            | HttpSigError::Expired
            | HttpSigError::NotYetValid
            | HttpSigError::ValidityWindowTooLong
            | HttpSigError::InvalidSignature => tonic::Status::unauthenticated(e.to_string()),
            HttpSigError::MalformedSignatureInput
            | HttpSigError::MalformedPublicKey
            | HttpSigError::MalformedSignature
            | HttpSigError::UnsupportedVersion
            | HttpSigError::TimestampSkew => tonic::Status::invalid_argument(e.to_string()),
        }
    }
}

/// The signed parameters, carried verbatim in `polycentric-signature-input`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SigParams {
    pub version: u8,
    /// Unix milliseconds the signature was created.
    pub created_ms: i64,
    /// Unix milliseconds after which the signature is no longer valid.
    pub expires_ms: i64,
    /// Signer identity (lowercase hex).
    pub keyid: String,
    /// Per-request random, base64 in the header; enables optional
    /// server-side replay rejection.
    pub nonce: [u8; 16],
}

impl SigParams {
    /// Serialize to the canonical `polycentric-signature-input` value.
    /// This exact string is both sent as metadata and embedded in the
    /// signature base, so signer and verifier agree byte-for-byte.
    pub fn to_header_value(&self) -> String {
        format!(
            "v={};created={};expires={};keyid={};nonce={}",
            self.version,
            self.created_ms,
            self.expires_ms,
            self.keyid,
            B64.encode(self.nonce),
        )
    }

    /// Parse a `polycentric-signature-input` value for semantic checks
    /// (freshness, keyid). The parsed struct is never used to rebuild
    /// the base — [`signature_base`] takes the literal string.
    fn parse(value: &str) -> Result<SigParams, HttpSigError> {
        let mut version = None;
        let mut created_ms = None;
        let mut expires_ms = None;
        let mut keyid = None;
        let mut nonce = None;

        for field in value.split(';') {
            let (name, val) = field
                .split_once('=')
                .ok_or(HttpSigError::MalformedSignatureInput)?;
            match name {
                "v" => {
                    version = Some(
                        val.parse::<u8>()
                            .map_err(|_| HttpSigError::MalformedSignatureInput)?,
                    )
                }
                "created" => {
                    created_ms = Some(
                        val.parse::<i64>()
                            .map_err(|_| HttpSigError::MalformedSignatureInput)?,
                    )
                }
                "expires" => {
                    expires_ms = Some(
                        val.parse::<i64>()
                            .map_err(|_| HttpSigError::MalformedSignatureInput)?,
                    )
                }
                "keyid" => keyid = Some(val.to_string()),
                "nonce" => {
                    let bytes = B64
                        .decode(val)
                        .map_err(|_| HttpSigError::MalformedSignatureInput)?;
                    nonce = Some(
                        <[u8; 16]>::try_from(bytes.as_slice())
                            .map_err(|_| HttpSigError::MalformedSignatureInput)?,
                    );
                }
                // Unknown fields are rejected rather than ignored: the
                // signature covers the literal string, so anything we
                // don't understand means our base won't match anyway.
                _ => return Err(HttpSigError::MalformedSignatureInput),
            }
        }

        let version = version.ok_or(HttpSigError::MalformedSignatureInput)?;
        if version != SCHEME_VERSION {
            return Err(HttpSigError::UnsupportedVersion);
        }
        Ok(SigParams {
            version,
            created_ms: created_ms.ok_or(HttpSigError::MalformedSignatureInput)?,
            expires_ms: expires_ms.ok_or(HttpSigError::MalformedSignatureInput)?,
            keyid: keyid.ok_or(HttpSigError::MalformedSignatureInput)?,
            nonce: nonce.ok_or(HttpSigError::MalformedSignatureInput)?,
        })
    }
}

/// The `sha-256=:<base64>:` digest of an encoded request message: the
/// value of the `polycentric-content-digest` header. The client computes
/// it over the message it sends; transport middleware recomputes it over
/// the bytes it received and rejects on mismatch.
pub fn content_digest(encoded_message: &[u8]) -> String {
    let digest = Sha256::digest(encoded_message);
    format!("sha-256=:{}:", B64.encode(digest))
}

/// Reject a lone timestamp (unix ms) outside the accepted clock-skew
/// window around `now_ms`. Saturating arithmetic so extreme timestamps
/// can't wrap the difference back inside the window. Pure: the caller
/// supplies `now_ms`.
pub fn check_timestamp_skew(timestamp_ms: i64, now_ms: i64) -> Result<(), HttpSigError> {
    if timestamp_ms.saturating_sub(now_ms).saturating_abs() > CLOCK_SKEW_MS {
        return Err(HttpSigError::TimestampSkew);
    }
    Ok(())
}

/// Reject a `created`/`expires` validity window that is malformed, too
/// long, not yet valid, or expired relative to `now_ms` (skew-tolerant).
/// Saturating arithmetic throughout so extreme values can't wrap.
fn check_freshness(created_ms: i64, expires_ms: i64, now_ms: i64) -> Result<(), HttpSigError> {
    let window = expires_ms.saturating_sub(created_ms);
    if !(0..=MAX_TTL_MS).contains(&window) {
        return Err(HttpSigError::ValidityWindowTooLong);
    }
    if created_ms.saturating_sub(now_ms) > CLOCK_SKEW_MS {
        return Err(HttpSigError::NotYetValid);
    }
    if now_ms.saturating_sub(expires_ms) > CLOCK_SKEW_MS {
        return Err(HttpSigError::Expired);
    }
    Ok(())
}

/// Build the exact bytes to sign/verify.
///
/// `content_digest` and `signature_input` are literal header strings, so
/// the signer and verifier cannot drift. `authority` must be the
/// server's configured canonical authority on both ends; a relayed
/// request fails because a different server rebuilds the base with its
/// own authority. `operation` is the gRPC method path, so a signature
/// for one endpoint cannot be replayed against another.
pub fn signature_base(
    operation: &str,
    authority: &str,
    content_digest: &str,
    signature_input: &str,
) -> Vec<u8> {
    format!(
        "@operation: {operation}\n\
         @authority: {authority}\n\
         content-digest: {content_digest}\n\
         @params: {signature_input}"
    )
    .into_bytes()
}

/// A request whose signature checked out: made by `public_key`, fresh,
/// and bound to this operation, authority, and body digest.
///
/// The signature proves possession of `public_key` — NOT that the key
/// speaks for `keyid`. The caller must authenticate the key against the
/// identity's currently-authorized keys before trusting the identity.
#[derive(Debug)]
pub struct VerifiedSignature {
    /// The signer identity claimed by the request.
    pub keyid: String,
    /// Raw ed25519 public key the signature verified against.
    pub public_key: Vec<u8>,
}

/// The single verifier entry point: check the signed-request metadata on
/// `headers` — presence and shape, freshness against `now_ms`, and the
/// ed25519 signature over the canonical base for `operation` at
/// `authority` — and return who signed it. See the module docs for the
/// two checks that stay with the caller.
pub fn verify_signed_request(
    authority: &str,
    operation: &str,
    headers: &MetadataMap,
    now_ms: i64,
) -> Result<VerifiedSignature, HttpSigError> {
    let content_digest = headers
        .get(META_CONTENT_DIGEST)
        .and_then(|v| v.to_str().ok())
        .ok_or(HttpSigError::MissingContentDigest)?;
    let signature_input = headers
        .get(META_SIGNATURE_INPUT)
        .and_then(|v| v.to_str().ok())
        .ok_or(HttpSigError::MissingSignatureInput)?;
    let public_key_b64 = headers
        .get(META_PUBLIC_KEY)
        .and_then(|v| v.to_str().ok())
        .ok_or(HttpSigError::MissingPublicKey)?;
    let signature_b64 = headers
        .get(META_SIGNATURE)
        .and_then(|v| v.to_str().ok())
        .ok_or(HttpSigError::MissingSignature)?;

    let params = SigParams::parse(signature_input)?;
    check_freshness(params.created_ms, params.expires_ms, now_ms)?;

    let public_key = B64
        .decode(public_key_b64)
        .map_err(|_| HttpSigError::MalformedPublicKey)?;
    let signature = B64
        .decode(signature_b64)
        .map_err(|_| HttpSigError::MalformedSignature)?;

    // The digest and params header values are fed in verbatim so signer
    // and verifier build the identical base.
    let base = signature_base(operation, authority, content_digest, signature_input);

    crate::signing::verify_signature(&public_key, &signature, &base)
        .map_err(|_| HttpSigError::InvalidSignature)?;

    Ok(VerifiedSignature {
        keyid: params.keyid,
        public_key,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::Signer as _;

    fn sample_params() -> SigParams {
        SigParams {
            version: SCHEME_VERSION,
            created_ms: 1_700_000_000_000,
            expires_ms: 1_700_000_030_000,
            keyid: "abcd1234".to_string(),
            nonce: [7u8; 16],
        }
    }

    #[test]
    fn params_round_trip() {
        let p = sample_params();
        let parsed = SigParams::parse(&p.to_header_value()).unwrap();
        assert_eq!(p, parsed);
    }

    #[test]
    fn params_rejects_unknown_field_and_bad_version() {
        assert_eq!(
            SigParams::parse(
                "v=1;created=1;expires=2;keyid=x;nonce=AAAAAAAAAAAAAAAAAAAAAA==;extra=1"
            ),
            Err(HttpSigError::MalformedSignatureInput)
        );
        assert_eq!(
            SigParams::parse("v=2;created=1;expires=2;keyid=x;nonce=AAAAAAAAAAAAAAAAAAAAAA=="),
            Err(HttpSigError::UnsupportedVersion)
        );
    }

    #[test]
    fn content_digest_binds_body() {
        assert_eq!(
            content_digest(b"encoded request"),
            content_digest(b"encoded request")
        );
        assert_ne!(
            content_digest(b"encoded request"),
            content_digest(b"tampered request")
        );
    }

    #[test]
    fn timestamp_skew_bounds() {
        let now = 1_700_000_000_000;
        assert!(check_timestamp_skew(now, now).is_ok());
        assert!(check_timestamp_skew(now - CLOCK_SKEW_MS, now).is_ok());
        assert_eq!(
            check_timestamp_skew(now - CLOCK_SKEW_MS - 1, now),
            Err(HttpSigError::TimestampSkew)
        );
        // Extreme values must saturate, not wrap back into the window.
        assert_eq!(
            check_timestamp_skew(i64::MIN, now),
            Err(HttpSigError::TimestampSkew)
        );
        assert_eq!(
            check_timestamp_skew(i64::MAX, now),
            Err(HttpSigError::TimestampSkew)
        );
    }

    #[test]
    fn freshness_window() {
        let now = 1_700_000_000_000;
        assert!(check_freshness(now, now + 10_000, now).is_ok());
        // Expired beyond skew (valid-length window, entirely in the past).
        assert_eq!(
            check_freshness(now - CLOCK_SKEW_MS - 10_001, now - CLOCK_SKEW_MS - 1, now,),
            Err(HttpSigError::Expired)
        );
        // Not yet valid beyond skew.
        assert_eq!(
            check_freshness(now + CLOCK_SKEW_MS + 1, now + CLOCK_SKEW_MS + 2, now),
            Err(HttpSigError::NotYetValid)
        );
        // Window longer than MAX_TTL_MS.
        assert_eq!(
            check_freshness(now, now + MAX_TTL_MS + 1, now),
            Err(HttpSigError::ValidityWindowTooLong)
        );
        // Negative window (expires before created).
        assert_eq!(
            check_freshness(now, now - 1, now),
            Err(HttpSigError::ValidityWindowTooLong)
        );
        // Extreme values saturate rather than wrap.
        assert_eq!(
            check_freshness(i64::MIN, i64::MAX, now),
            Err(HttpSigError::ValidityWindowTooLong)
        );
    }

    #[test]
    fn signature_base_is_deterministic_from_literals() {
        let p = sample_params();
        let cd = content_digest(b"body");
        let a = signature_base("/svc/SetBanStatus", "srv:3000", &cd, &p.to_header_value());
        let b = signature_base("/svc/SetBanStatus", "srv:3000", &cd, &p.to_header_value());
        assert_eq!(a, b);
    }

    /// Headers for a signed request, exactly as the client produces them.
    fn signed_headers(
        operation: &str,
        authority: &str,
        now: i64,
        message: &[u8],
    ) -> (MetadataMap, ed25519_dalek::VerifyingKey) {
        let signing = ed25519_dalek::SigningKey::from_bytes(&[42u8; 32]);
        let digest = content_digest(message);
        let params = SigParams {
            version: SCHEME_VERSION,
            created_ms: now,
            expires_ms: now + 60_000,
            keyid: "abcd1234".to_string(),
            nonce: [0u8; 16],
        };
        let input = params.to_header_value();
        let base = signature_base(operation, authority, &digest, &input);
        let sig = signing.sign(&base);

        let mut headers = MetadataMap::new();
        headers.insert(META_CONTENT_DIGEST, digest.parse().unwrap());
        headers.insert(META_SIGNATURE_INPUT, input.parse().unwrap());
        headers.insert(
            META_PUBLIC_KEY,
            B64.encode(signing.verifying_key().as_bytes())
                .parse()
                .unwrap(),
        );
        headers.insert(META_SIGNATURE, B64.encode(sig.to_bytes()).parse().unwrap());
        (headers, signing.verifying_key())
    }

    #[test]
    fn verify_accepts_a_well_signed_request() {
        let now = 1_700_000_000_000;
        let (headers, key) = signed_headers("/svc/M", "srv:3000", now, b"msg");

        let verified = verify_signed_request("srv:3000", "/svc/M", &headers, now).unwrap();
        assert_eq!(verified.keyid, "abcd1234");
        assert_eq!(verified.public_key, key.as_bytes().to_vec());
    }

    #[test]
    fn verify_rejects_missing_headers() {
        let now = 1_700_000_000_000;
        assert_eq!(
            verify_signed_request("srv", "/op", &MetadataMap::new(), now).unwrap_err(),
            HttpSigError::MissingContentDigest
        );

        let (mut headers, _) = signed_headers("/op", "srv", now, b"msg");
        headers.remove(META_PUBLIC_KEY);
        assert_eq!(
            verify_signed_request("srv", "/op", &headers, now).unwrap_err(),
            HttpSigError::MissingPublicKey
        );
    }

    #[test]
    fn verify_rejects_expired_signature() {
        let now = 1_700_000_000_000;
        let (headers, _) = signed_headers("/op", "srv", now, b"msg");
        let later = now + 60_000 + CLOCK_SKEW_MS + 1;
        assert_eq!(
            verify_signed_request("srv", "/op", &headers, later).unwrap_err(),
            HttpSigError::Expired
        );
    }

    #[test]
    fn verify_rejects_relay_operation_swap_tamper_and_key_swap() {
        let now = 1_700_000_000_000;
        let (headers, _) = signed_headers("/svc/M", "srv:3000", now, b"msg");

        // Relayed to another server: the verifier rebuilds the base with
        // its own authority, so the signature no longer matches.
        assert_eq!(
            verify_signed_request("evil:3000", "/svc/M", &headers, now).unwrap_err(),
            HttpSigError::InvalidSignature
        );

        // Replayed against a different operation.
        assert_eq!(
            verify_signed_request("srv:3000", "/svc/Other", &headers, now).unwrap_err(),
            HttpSigError::InvalidSignature
        );

        // Body swapped in flight (middleware also rejects a digest/body
        // mismatch, but the signature fails on its own since the base
        // covers the digest header).
        let (mut headers, _) = signed_headers("/svc/M", "srv:3000", now, b"msg");
        headers.insert(
            META_CONTENT_DIGEST,
            content_digest(b"tampered").parse().unwrap(),
        );
        assert_eq!(
            verify_signed_request("srv:3000", "/svc/M", &headers, now).unwrap_err(),
            HttpSigError::InvalidSignature
        );

        // Public key swapped for a stranger's: their key didn't make
        // this signature. (Re-signing with their own key would pass here
        // and then fail the caller's key-authentication step.)
        let (mut headers, _) = signed_headers("/svc/M", "srv:3000", now, b"msg");
        let stranger = ed25519_dalek::SigningKey::from_bytes(&[9u8; 32]);
        headers.insert(
            META_PUBLIC_KEY,
            B64.encode(stranger.verifying_key().as_bytes())
                .parse()
                .unwrap(),
        );
        assert_eq!(
            verify_signed_request("srv:3000", "/svc/M", &headers, now).unwrap_err(),
            HttpSigError::InvalidSignature
        );
    }
}
