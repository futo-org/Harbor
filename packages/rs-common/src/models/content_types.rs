//! Content type IDs for the Polycentric v2 protocol.
//!
//! Source of truth: the `content_body` field numbers in
//! `protos/polycentric/v2/content.proto`.

use crate::models::protos_v2::content::ContentBody;

pub const POST: i32 = 2;
pub const DELETE: i32 = 3;
pub const FOLLOW: i32 = 4;
pub const BLOCK: i32 = 5;
pub const REACTION: i32 = 6;
pub const PROFILE_UPDATE: i32 = 7;
pub const IDENTITY: i32 = 8;
pub const REPOST: i32 = 9;
pub const REPORT: i32 = 10;
pub const LABELS: i32 = 11;
pub const VERIFICATION_CLAIM: i32 = 12;
pub const VERIFICATION_VERIFY: i32 = 13;
pub const VERIFICATION_TARGET: i32 = 14;
pub const ATTRIBUTED_TO_REACTION: i32 = 15;

/// Returns the content type ID of `body`.
pub fn of(body: &ContentBody) -> i32 {
    match body {
        ContentBody::Post(_) => POST,
        ContentBody::Delete(_) => DELETE,
        ContentBody::Follow(_) => FOLLOW,
        ContentBody::Block(_) => BLOCK,
        ContentBody::Reaction(_) => REACTION,
        ContentBody::ProfileUpdate(_) => PROFILE_UPDATE,
        ContentBody::Identity(_) => IDENTITY,
        ContentBody::Repost(_) => REPOST,
        ContentBody::Report(_) => REPORT,
        ContentBody::Labels(_) => LABELS,
        ContentBody::VerificationClaim(_) => VERIFICATION_CLAIM,
        ContentBody::VerificationVerify(_) => VERIFICATION_VERIFY,
        ContentBody::VerificationTarget(_) => VERIFICATION_TARGET,
        ContentBody::AttributedToReaction(_) => ATTRIBUTED_TO_REACTION,
    }
}
