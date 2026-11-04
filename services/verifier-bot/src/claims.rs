//! Verification-claim contract, shared with the app's platform loop-back
//! flow (apps/harbor .../hooks/useVerifyPlatformClaim.ts):
//!   * [`SCHEMA_NAME`] — all platform claims share ONE `VerificationSchema`
//!     (the app's "Platform" claim type); the schema name does NOT encode the
//!     platform. `request_verify` only checks the claim uses this schema.
//!   * field names — verifiers address account fields by numeric index
//!     (key 0 = handle, key 1 = channel id, …); claims key them `account`,
//!     `account_id`, `field_2`, `field_3`, …. A claim also carries display
//!     metadata the verifiers don't proof-check: `platform` (the platform's
//!     route slug, checked against the verifier handling the claim) and `url`
//!     (the profile URL).
//!   * expected token — the loop-back token a user puts in their profile.
//!     The app's loop-back link is `<app-url>/<identity key>`, so the token is
//!     the claim's `EventKey.identity`.

use std::time::Duration;

use async_trait::async_trait;
use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{
    Content, Event, EventBundle, EventKey, VerificationSchema, VerificationVerify,
    content::ContentBody,
};
use prost::Message;
use serde::{Deserialize, Serialize};

use crate::error::{VResult, VerifierError};

/// The single schema shared by every platform verification claim.
pub const SCHEMA_NAME: &str = "Platform";

/// How many times to look for a claim, and how long to wait in between:
/// clients verify right after publishing, so the claim may still be on its
/// way to the servers the bot reads from.
const FETCH_ATTEMPTS: usize = 4;
const FETCH_RETRY_DELAY: Duration = Duration::from_millis(1500);

/// One account field of a claim, addressed by ordinal.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClaimField {
    pub key: i64,
    pub value: String,
}

impl ClaimField {
    pub fn new(key: i64, value: impl Into<String>) -> Self {
        Self {
            key,
            value: value.into(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct DecodedClaim {
    /// The claim event, referenced by a VerificationVerify when we verify it.
    pub event_key: EventKey,
    /// `VerificationSchema.name`.
    pub schema_name: String,
    /// Account fields keyed by the ordinal index the verifiers address,
    /// sorted by key.
    pub fields: Vec<ClaimField>,
    /// The platform route slug the claim was made for, when recorded.
    pub platform: Option<String>,
    /// Loop-back token to look for in the claimant's profile.
    pub expected_token: String,
}

/// What verifying needs from the Polycentric client; implemented by the SDK
/// client, and by fakes in tests.
#[async_trait]
pub trait ClaimBackend: Send + Sync {
    /// The VERIFICATIONS events of `identity` on the servers, queried fresh
    /// under `query_key`.
    async fn list_verifications(
        &self,
        identity: &str,
        query_key: Vec<String>,
    ) -> Result<Vec<EventBundle>, String>;

    /// Sign and store `content` in the VERIFICATIONS collection as the bot.
    async fn publish_verification(&self, content: &Content) -> Result<EventBundle, String>;

    /// Push what the bot published to its servers.
    async fn push(&self) -> Result<(), String>;
}

#[async_trait]
impl ClaimBackend for polycentric_core::sdk::Client {
    async fn list_verifications(
        &self,
        identity: &str,
        query_key: Vec<String>,
    ) -> Result<Vec<EventBundle>, String> {
        self.list_events(
            polycentric_core::query::event::ListEventsArgs {
                size: None,
                identity: identity.to_string(),
                collection: Some(collections::VERIFICATIONS),
                signed_by: None,
                sequence_gt: None,
                sequence_lt: None,
                heads: None,
            },
            Some(query_key),
            None,
        )
        .await
        .map_err(|e| e.to_string())
    }

    async fn publish_verification(&self, content: &Content) -> Result<EventBundle, String> {
        self.publish_content(content, collections::VERIFICATIONS)
            .await
            .map_err(|e| e.to_string())
    }

    async fn push(&self) -> Result<(), String> {
        self.sync(polycentric_core::sdk::types::SyncStrategy::PartialPush)
            .await
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

/// The hex id clients use for an event: its serialized `EventKey`.
pub fn event_id(key: &EventKey) -> String {
    hex::encode(key.encode_to_vec())
}

/// Parse the hex-encoded `EventKey` id a client sends to reference its claim.
pub fn parse_claim_id(claim_id: &str) -> Option<EventKey> {
    if claim_id.is_empty() || claim_id.len() % 2 != 0 {
        return None;
    }
    let bytes = hex::decode(claim_id).ok()?;
    let key = EventKey::decode(bytes.as_slice()).ok()?;
    // The key must actually identify an event.
    if key.identity.is_empty() || key.signed_by.is_none() {
        return None;
    }
    Some(key)
}

/// Ordinal a schema field key addresses, or `None` for metadata fields.
fn field_ordinal(key: &str) -> Option<i64> {
    match key {
        "account" => Some(0),
        "account_id" => Some(1),
        _ => key
            .strip_prefix("field_")
            .filter(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
            .and_then(|n| n.parse().ok()),
    }
}

fn event_of(bundle: &EventBundle) -> Option<Event> {
    Event::decode(bundle.signed_event.as_ref()?.event_bytes.as_slice()).ok()
}

/// Fetch the verification claim at `event_key` and decode it into the shape
/// the verifiers expect.
pub async fn fetch_claim(
    backend: &dyn ClaimBackend,
    event_key: &EventKey,
) -> VResult<DecodedClaim> {
    let mut bundle = None;
    for attempt in 0..FETCH_ATTEMPTS {
        if attempt > 0 {
            tokio::time::sleep(FETCH_RETRY_DELAY).await;
        }
        // A unique key so each attempt queries the servers, not a cache.
        let query_key = vec![
            "verifier-claim".to_string(),
            event_key.identity.clone(),
            event_key.sequence.to_string(),
            attempt.to_string(),
            crate::util::unix_seconds().to_string(),
        ];
        let bundles = backend
            .list_verifications(&event_key.identity, query_key)
            .await
            .map_err(|e| VerifierError::msg(format!("Could not load claims for identity: {e}")))?;
        bundle = bundles.into_iter().find(|b| {
            event_of(b).and_then(|e| e.key).map(|k| k.sequence) == Some(event_key.sequence)
        });
        if bundle.is_some() {
            break;
        }
    }

    let found = bundle.and_then(|b| {
        let content = b.serialized_content.as_ref()?.content_bytes.clone();
        Some((b, content))
    });
    let Some((bundle, content_bytes)) = found else {
        return Err(VerifierError::new(
            "Could not find the referenced claim event.",
            format!(
                "No event with sequence {} in collection {} for identity '{}' on the servers this bot syncs with.",
                event_key.sequence,
                collections::VERIFICATIONS,
                event_key.identity
            ),
        ));
    };

    decode_claim(&bundle, &content_bytes)
        .map_err(|e| VerifierError::msg(format!("Failed to decode the claim: {e}")))?
}

/// Decode a claim bundle. The outer error is a decoding failure, the inner
/// one a well-formed event that isn't a usable claim.
fn decode_claim(
    bundle: &EventBundle,
    content_bytes: &[u8],
) -> Result<VResult<DecodedClaim>, prost::DecodeError> {
    let event_bytes = bundle
        .signed_event
        .as_ref()
        .map(|s| s.event_bytes.as_slice())
        .unwrap_or_default();
    let event = Event::decode(event_bytes)?;
    let Some(key) = event.key else {
        return Ok(Err(VerifierError::msg("Claim event has no key.")));
    };
    let content = Content::decode(content_bytes)?;
    let Some(ContentBody::VerificationClaim(claim)) = content.content_body else {
        return Ok(Err(VerifierError::msg(
            "Referenced event is not a verification claim.",
        )));
    };
    let Some(schema_bytes) = claim
        .schema
        .as_ref()
        .map(|s| s.schema_bytes.as_slice())
        .filter(|b| !b.is_empty())
    else {
        return Ok(Err(VerifierError::msg("Claim is missing its schema.")));
    };
    let schema = VerificationSchema::decode(schema_bytes)?;

    let decode = |key: &str| {
        claim
            .fields
            .get(key)
            .map(|b| String::from_utf8_lossy(b).into_owned())
            .unwrap_or_default()
    };
    let mut fields = Vec::new();
    let mut platform = None;
    for field in &schema.fields {
        if let Some(ordinal) = field_ordinal(&field.key) {
            fields.push(ClaimField::new(ordinal, decode(&field.key)));
        } else if field.key == "platform" {
            platform = Some(decode(&field.key));
        }
        // Anything else (e.g. `url`) is display metadata, not proof-checked.
    }
    fields.sort_by_key(|f| f.key);

    let expected_token = key.identity.clone();
    Ok(Ok(DecodedClaim {
        event_key: key,
        schema_name: schema.name,
        fields,
        platform,
        expected_token,
    }))
}

/// Publish a VerificationVerify for `claim_event_key` as the bot's identity
/// (this signed event IS the verification). Returns the hex `EventKey` id of
/// the verify event.
pub async fn publish_verify(
    backend: &dyn ClaimBackend,
    claim_event_key: &EventKey,
) -> Result<String, String> {
    let content = Content {
        content_body: Some(ContentBody::VerificationVerify(VerificationVerify {
            claim_event_key: Some(claim_event_key.clone()),
        })),
    };
    let bundle = backend.publish_verification(&content).await?;
    let key = event_of(&bundle)
        .and_then(|e| e.key)
        .ok_or("Verify event has no key.")?;
    Ok(event_id(&key))
}

#[cfg(test)]
pub(crate) mod testing {
    //! An in-memory [`ClaimBackend`] holding hand-built claim events.

    use std::sync::Mutex;

    use polycentric_common::models::protos_v2::{
        ContentDigest, FieldDef, PublicKey, SerializedContent, SerializedVerificationSchema,
        SignedEvent, VerificationClaim,
    };

    use super::*;

    pub const IDENTITY: &str = "claimant-identity";

    #[derive(Default)]
    pub struct FakeBackend {
        pub bundles: Mutex<Vec<EventBundle>>,
        pub published: Mutex<Vec<Content>>,
        pub pushes: Mutex<usize>,
    }

    pub fn key(sequence: u64) -> EventKey {
        EventKey {
            collection: collections::VERIFICATIONS,
            identity: IDENTITY.into(),
            signed_by: Some(PublicKey {
                key_type: 1,
                key: vec![1, 2, 3],
            }),
            sequence,
        }
    }

    pub fn bundle(key: EventKey, content: &Content) -> EventBundle {
        let event = Event {
            key: Some(key),
            ..Default::default()
        };
        EventBundle {
            signed_event: Some(SignedEvent {
                signature: vec![0; 64],
                event_bytes: event.encode_to_vec(),
            }),
            serialized_content: Some(SerializedContent {
                content_bytes: content.encode_to_vec(),
            }),
            ..Default::default()
        }
    }

    pub fn claim_content(schema_name: &str, fields: &[(&str, &str)]) -> Content {
        let schema = VerificationSchema {
            name: schema_name.into(),
            description: String::new(),
            fields: fields
                .iter()
                .map(|(k, _)| FieldDef {
                    key: (*k).into(),
                    kind: 1,
                    required: true,
                    description: (*k).into(),
                    ..Default::default()
                })
                .collect(),
        };
        let schema_bytes = schema.encode_to_vec();
        Content {
            content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
                schema: Some(SerializedVerificationSchema {
                    digest: Some(ContentDigest {
                        r#type: 1,
                        value: <sha2::Sha256 as sha2::Digest>::digest(&schema_bytes).to_vec(),
                    }),
                    schema_bytes,
                }),
                fields: fields
                    .iter()
                    .map(|(k, v)| ((*k).to_string(), v.as_bytes().to_vec()))
                    .collect(),
            })),
        }
    }

    impl FakeBackend {
        /// Store a claim at `sequence` and return its hex id.
        pub fn add_claim(
            &self,
            sequence: u64,
            schema_name: &str,
            fields: &[(&str, &str)],
        ) -> String {
            let key = key(sequence);
            self.bundles
                .lock()
                .unwrap()
                .push(bundle(key.clone(), &claim_content(schema_name, fields)));
            event_id(&key)
        }
    }

    #[async_trait]
    impl ClaimBackend for FakeBackend {
        async fn list_verifications(
            &self,
            identity: &str,
            _query_key: Vec<String>,
        ) -> Result<Vec<EventBundle>, String> {
            Ok(self
                .bundles
                .lock()
                .unwrap()
                .iter()
                .filter(|b| {
                    event_of(b)
                        .and_then(|e| e.key)
                        .is_some_and(|k| k.identity == identity)
                })
                .cloned()
                .collect())
        }

        async fn publish_verification(&self, content: &Content) -> Result<EventBundle, String> {
            let mut published = self.published.lock().unwrap();
            published.push(content.clone());
            let mut key = key(published.len() as u64);
            key.identity = "bot-identity".into();
            Ok(bundle(key, content))
        }

        async fn push(&self) -> Result<(), String> {
            *self.pushes.lock().unwrap() += 1;
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::testing::*;
    use super::*;

    #[test]
    fn parse_claim_id_round_trips_a_hex_event_key() {
        let key = EventKey {
            collection: 8,
            identity: "identity-hex".into(),
            signed_by: Some(polycentric_common::models::protos_v2::PublicKey {
                key_type: 1,
                key: vec![1, 2, 3],
            }),
            sequence: 7,
        };
        let parsed = parse_claim_id(&event_id(&key)).unwrap();
        assert_eq!(parsed.sequence, 7);
        assert_eq!(parsed.identity, "identity-hex");
        // Uppercase hex is accepted too.
        assert!(parse_claim_id(&event_id(&key).to_uppercase()).is_some());
    }

    #[test]
    fn parse_claim_id_rejects_malformed_ids() {
        assert!(parse_claim_id("not-hex-!!").is_none());
        assert!(parse_claim_id("").is_none());
        assert!(parse_claim_id("abc").is_none()); // odd length
        // Valid hex, but not a key that identifies an event.
        assert!(parse_claim_id(&hex::encode(EventKey::default().encode_to_vec())).is_none());
    }

    #[test]
    fn field_ordinals() {
        assert_eq!(field_ordinal("account"), Some(0));
        assert_eq!(field_ordinal("account_id"), Some(1));
        assert_eq!(field_ordinal("field_2"), Some(2));
        assert_eq!(field_ordinal("field_"), None);
        assert_eq!(field_ordinal("field_2x"), None);
        assert_eq!(field_ordinal("platform"), None);
        assert_eq!(field_ordinal("url"), None);
    }

    #[tokio::test]
    async fn fetch_claim_decodes_fields_platform_and_token() {
        let backend = FakeBackend::default();
        backend.add_claim(1, "Other", &[("account", "nope")]);
        let id = backend.add_claim(
            2,
            SCHEMA_NAME,
            &[
                ("field_2", "third"),
                ("platform", "github"),
                ("account", "octocat"),
                ("url", "https://github.com/octocat"),
                ("account_id", "583231"),
            ],
        );
        let claim = fetch_claim(&backend, &parse_claim_id(&id).unwrap())
            .await
            .unwrap();
        assert_eq!(claim.schema_name, SCHEMA_NAME);
        assert_eq!(claim.platform.as_deref(), Some("github"));
        assert_eq!(claim.expected_token, IDENTITY);
        assert_eq!(claim.event_key.sequence, 2);
        assert_eq!(
            claim.fields,
            vec![
                ClaimField::new(0, "octocat"),
                ClaimField::new(1, "583231"),
                ClaimField::new(2, "third"),
            ]
        );
    }

    #[tokio::test(start_paused = true)]
    async fn fetch_claim_reports_a_missing_claim() {
        let backend = FakeBackend::default();
        let err = fetch_claim(&backend, &key(9)).await.unwrap_err();
        assert_eq!(err.message, "Could not find the referenced claim event.");
    }

    #[tokio::test]
    async fn fetch_claim_rejects_non_claims() {
        let backend = FakeBackend::default();
        let content = Content {
            content_body: Some(ContentBody::VerificationVerify(VerificationVerify {
                claim_event_key: None,
            })),
        };
        backend
            .bundles
            .lock()
            .unwrap()
            .push(bundle(key(3), &content));
        let err = fetch_claim(&backend, &key(3)).await.unwrap_err();
        assert_eq!(err.message, "Referenced event is not a verification claim.");
    }

    #[tokio::test]
    async fn publish_verify_returns_the_verify_event_id() {
        let backend = FakeBackend::default();
        let id = publish_verify(&backend, &key(4)).await.unwrap();
        let verify_key = parse_claim_id(&id).unwrap();
        assert_eq!(verify_key.identity, "bot-identity");
        let published = backend.published.lock().unwrap();
        let Some(ContentBody::VerificationVerify(v)) = &published[0].content_body else {
            panic!("published something else");
        };
        assert_eq!(v.claim_event_key.as_ref().unwrap().sequence, 4);
    }
}
