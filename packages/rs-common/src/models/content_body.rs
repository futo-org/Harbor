use std::fmt;

use crate::models::protos_v2::content::ContentBody;
use crate::models::validate::Validate;
use crate::models::{
    attributed_to_reaction, block, delete, follow, labels, post, profile_update, reaction, report,
    repost, verification_claim, verification_target, verification_verify,
};

impl Validate for ContentBody {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        match self {
            ContentBody::Post(post) => {
                post.validate_check(errors, |err| map_err(ValidationError::Post(err)))
            }
            ContentBody::Delete(delete) => {
                delete.validate_check(errors, |err| map_err(ValidationError::Delete(err)))
            }
            ContentBody::Follow(follow) => {
                follow.validate_check(errors, |err| map_err(ValidationError::Follow(err)))
            }
            ContentBody::Block(block) => {
                block.validate_check(errors, |err| map_err(ValidationError::Block(err)))
            }
            ContentBody::Reaction(reaction) => {
                reaction.validate_check(errors, |err| map_err(ValidationError::Reaction(err)))
            }
            ContentBody::AttributedToReaction(reaction) => reaction.validate_check(errors, |err| {
                map_err(ValidationError::AttributedToReaction(err))
            }),
            ContentBody::ProfileUpdate(update) => {
                update.validate_check(errors, |err| map_err(ValidationError::ProfileUpdate(err)))
            }
            ContentBody::Identity(_) => {
                // TODO: identity.
            }
            ContentBody::Repost(repost) => {
                repost.validate_check(errors, |err| map_err(ValidationError::Repost(err)))
            }
            ContentBody::Report(report) => {
                report.validate_check(errors, |err| map_err(ValidationError::Report(err)))
            }
            ContentBody::Labels(label) => {
                label.validate_check(errors, |err| map_err(ValidationError::Labels(err)))
            }
            ContentBody::VerificationClaim(claim) => claim.validate_check(errors, |err| {
                map_err(ValidationError::VerificationClaim(err))
            }),
            ContentBody::VerificationVerify(verify) => verify.validate_check(errors, |err| {
                map_err(ValidationError::VerificationVerify(err))
            }),
            ContentBody::VerificationTarget(target) => target.validate_check(errors, |err| {
                map_err(ValidationError::VerificationTarget(err))
            }),
        }
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
#[cfg_attr(feature = "uniffi", uniffi(name = "ContentBodyValidationError"))]
pub enum ValidationError {
    Post(post::ValidationError),
    Delete(delete::ValidationError),
    Follow(follow::ValidationError),
    Block(block::ValidationError),
    Reaction(reaction::ValidationError),
    AttributedToReaction(attributed_to_reaction::ValidationError),
    ProfileUpdate(profile_update::ValidationError),
    Repost(repost::ValidationError),
    Report(report::ValidationError),
    Labels(labels::ValidationError),
    VerificationClaim(verification_claim::ValidationError),
    VerificationVerify(verification_verify::ValidationError),
    VerificationTarget(verification_target::ValidationError),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Post(err) => write!(f, "post {err}"),
            ValidationError::Delete(err) => write!(f, "delete {err}"),
            ValidationError::Follow(err) => write!(f, "follow {err}"),
            ValidationError::Block(err) => write!(f, "block {err}"),
            ValidationError::Reaction(err) => write!(f, "reaction {err}"),
            ValidationError::AttributedToReaction(err) => write!(f, "attributed to reaction {err}"),
            ValidationError::ProfileUpdate(err) => write!(f, "profile update {err}"),
            ValidationError::Repost(err) => write!(f, "repost {err}"),
            ValidationError::Report(err) => write!(f, "report {err}"),
            ValidationError::Labels(err) => write!(f, "labels {err}"),
            ValidationError::VerificationClaim(err) => write!(f, "verfication claim {err}"),
            ValidationError::VerificationVerify(err) => write!(f, "verfication verify {err}"),
            ValidationError::VerificationTarget(err) => write!(f, "verfication target {err}"),
        }
    }
}
