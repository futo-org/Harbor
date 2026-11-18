//! Content type IDs for the Polycentric v2 protocol.
//!
//! Source of truth: the `content_body` field numbers in
//! `protos/polycentric/v2/content.proto`.

use crate::models::protos_v2::content::ContentBody;

/// [`ContentBody::Post`].
pub const POST: i32 = 2;
/// [`ContentBody::Delete`].
pub const DELETE: i32 = 3;
/// [`ContentBody::Follow`].
pub const FOLLOW: i32 = 4;
/// [`ContentBody::Block`].
pub const BLOCK: i32 = 5;
/// [`ContentBody::Reaction`].
pub const REACTION: i32 = 6;
/// [`ContentBody::ProfileUpdate`].
pub const PROFILE_UPDATE: i32 = 7;
/// [`ContentBody::Identity`].
pub const IDENTITY: i32 = 8;
/// [`ContentBody::Repost`].
pub const REPOST: i32 = 9;
/// [`ContentBody::Report`].
pub const REPORT: i32 = 10;
/// [`ContentBody::Labels`].
pub const LABELS: i32 = 11;
/// [`ContentBody::VerificationClaim`].
pub const VERIFICATION_CLAIM: i32 = 12;
/// [`ContentBody::VerificationVerify`].
pub const VERIFICATION_VERIFY: i32 = 13;
/// [`ContentBody::VerificationTarget`].
pub const VERIFICATION_TARGET: i32 = 14;
/// [`ContentBody::AttributedToReaction`].
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
