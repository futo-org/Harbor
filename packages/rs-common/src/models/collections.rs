//! Reserved collection IDs for the Polycentric v2 protocol.
//!
//! Source of truth: `protos/polycentric/v2/event_key.proto`.

/// Identity documents.
pub const IDENTITY: i32 = 1;
/// The identity's feed.
pub const FEED: i32 = 2;
/// Profile updates.
pub const PROFILE: i32 = 3;
/// Interactions such as reactions.
pub const INTERACTIONS: i32 = 4;
/// Social graph, e.g. follows.
pub const SOCIAL_GRAPH: i32 = 5;
/// Reports.
pub const REPORTS: i32 = 6;
/// Labels.
pub const LABELS: i32 = 7;
/// Verifications.
pub const VERIFICATIONS: i32 = 8;
