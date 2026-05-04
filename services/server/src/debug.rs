use ::entity::{content_model as ContentModel, event_model as EventModel};
use axum::{Router, routing::get};
use std::sync::Arc;

mod handler;
mod query;
mod view;

const RECENT_LIMIT: u64 = 200;

const STYLE_CSS: &str = "body { font-family: sans-serif; margin: 20px; } \
.event-card { border: 1px solid #ccc; border-radius: 4px; padding: 12px; margin-bottom: 12px; display: inline-block; } \
.event-identifier { font-weight: bold; display: block; margin-bottom: 8px; } \
.event-meta { font-size: 0.9em; color: #666; } \
a { color: #0066cc; }";

// --- Router & state ---

/// Build the debug router. Mounted as the root of its own listener.
pub fn debug_router(db: sea_orm::DatabaseConnection) -> Router {
    let state = Arc::new(DebugState { db });

    Router::new()
        .route("/", get(handler::debug_page_handler))
        .route("/events", get(handler::list_events_handler))
        .route("/identity/{hex}", get(handler::identity_detail_handler))
        .route("/keypair/{hex}", get(handler::keypair_detail_handler))
        .route(
            "/event/{identity}/{collection}/{sequence}",
            get(handler::event_detail_handler),
        )
        .route(
            "/event/{identity}/{collection}/{sequence}/json",
            get(handler::event_detail_json_handler),
        )
        .route(
            "/event/{identity}/{collection}/{sequence}/content",
            get(handler::event_content_handler),
        )
        .with_state(state)
}

#[derive(Clone)]
struct DebugState {
    db: sea_orm::DatabaseConnection,
}

// --- Domain types ---

type EventWithContent = (EventModel::Model, Option<ContentModel::Model>);

#[derive(Copy, Clone)]
enum Collection {
    Identity,
    Feed,
    Profile,
    Interactions,
    SocialGraph,
    Unknown,
}

impl Collection {
    fn name(self) -> &'static str {
        match self {
            Self::Identity => "Identity",
            Self::Feed => "Feed",
            Self::Profile => "Profile",
            Self::Interactions => "Interactions",
            Self::SocialGraph => "Social Graph",
            Self::Unknown => "Unknown",
        }
    }
}

impl From<i32> for Collection {
    fn from(v: i32) -> Self {
        match v {
            1 => Self::Identity,
            2 => Self::Feed,
            3 => Self::Profile,
            4 => Self::Interactions,
            5 => Self::SocialGraph,
            _ => Self::Unknown,
        }
    }
}

impl From<i16> for Collection {
    fn from(v: i16) -> Self {
        (v as i32).into()
    }
}

impl std::fmt::Display for Collection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.name())
    }
}

// --- Formatting & decoding ---

/// Format a public key as `{type}_{hex}` to match the app UI.
fn format_pubkey(key_type: i16, key_bytes: &[u8]) -> String {
    format!("{}_{}", key_type, hex::encode(key_bytes))
}

fn shorten_hex(hex: &str) -> String {
    if hex.len() <= 8 {
        hex.to_string()
    } else {
        format!("{}...{}", &hex[..4], &hex[hex.len() - 4..])
    }
}

/// Build the absolute URL for a content blob. Uses the same `CDN_URL`
/// env var the main server publishes via `ServerService.GetInfo`, so
/// debug images load from wherever the frontend already fetches blobs
/// from. This matters because the debug listener is on a different
/// port than the `/blob/{id}` route.
fn blob_url(digest: &crate::service::proto::ContentDigest) -> String {
    let base = std::env::var("CDN_URL")
        .unwrap_or_else(|_| "http://localhost:3000".to_string());
    format!(
        "{}/blob/{}_{}",
        base,
        digest.r#type,
        hex::encode(&digest.value)
    )
}

/// Extract the first variant's blob URL from a profile's avatar set.
fn avatar_url(
    profile: Option<&crate::service::proto::ProfileUpdate>,
) -> Option<String> {
    profile
        .and_then(|p| p.avatar.as_ref())
        .and_then(|set| set.images.first())
        .and_then(|img| img.blob.as_ref())
        .and_then(|blob| blob.digest.as_ref())
        .map(blob_url)
}

/// Display name if the profile has one, otherwise short-hex identity.
fn display_label(
    identity: &str,
    profile: Option<&crate::service::proto::ProfileUpdate>,
) -> String {
    let name = profile.and_then(|p| p.name.as_deref()).unwrap_or("");
    if name.is_empty() {
        shorten_hex(identity)
    } else {
        name.to_string()
    }
}

fn short_pubkey_list(keys: &[crate::service::proto::PublicKey]) -> String {
    keys.iter()
        .map(|k| shorten_hex(&format_pubkey(k.key_type as i16, &k.key)))
        .collect::<Vec<_>>()
        .join(", ")
}

fn decode_event_proto(
    event_bytes: &[u8],
) -> Option<crate::service::proto::Event> {
    use prost::Message;
    crate::service::proto::Event::decode(event_bytes).ok()
}

fn decode_content_proto(
    bytes: &[u8],
) -> Option<crate::service::proto::Content> {
    use prost::Message;
    crate::service::proto::Content::decode(bytes).ok()
}

fn vector_clock_string(proto: Option<&crate::service::proto::Event>) -> String {
    match proto.and_then(|e| e.vector_clock.as_ref()) {
        Some(vc) => format!(
            "[{}]",
            vc.sequence
                .iter()
                .map(|s| s.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ),
        None => "n/a".to_string(),
    }
}

/// Find the most recent `ProfileUpdate` content body across the given
/// events. Used to attach the avatar and display name to identity/keypair
/// page headers.
fn latest_profile_update(
    events: &[&EventWithContent],
) -> Option<crate::service::proto::ProfileUpdate> {
    use crate::service::proto::content::ContentBody;
    let mut best: Option<(i64, crate::service::proto::ProfileUpdate)> = None;
    for (ev, content) in events {
        let Some(content) = content else { continue };
        let Some(proto) = decode_content_proto(&content.serialized_bytes)
        else {
            continue;
        };
        if let Some(ContentBody::ProfileUpdate(pu)) = proto.content_body
            && best.as_ref().is_none_or(|(s, _)| ev.sequence > *s)
        {
            best = Some((ev.sequence, pu));
        }
    }
    best.map(|(_, pu)| pu)
}

/// Pull the rotation/signing key lists out of an identity event's content,
/// for the verbose card summary. Returns `None` for non-identity events.
fn identity_keys(
    event: &EventModel::Model,
    content: Option<&ContentModel::Model>,
) -> Option<crate::service::proto::Identity> {
    use crate::service::proto::content::ContentBody;
    if event.collection != 1 {
        return None;
    }
    let proto = decode_content_proto(&content?.serialized_bytes)?;
    match proto.content_body? {
        ContentBody::Identity(identity) => Some(identity),
        _ => None,
    }
}
