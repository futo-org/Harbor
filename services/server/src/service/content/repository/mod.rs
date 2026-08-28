//! Repository for persisting content into its normalized child tables.
//! `Mutation::save_content_child` dispatches each `ContentBody` variant
//! to its own submodule, which owns that table's insert logic.

mod attributed_to_reaction;
mod block;
mod delete;
mod follow;
mod identity;
mod labels;
mod post;
mod profile_update;
mod reaction;
mod report;
mod repost;
mod verification_claim;
mod verification_target;
mod verification_verify;

use crate::service::proto::{EventKey, PublicKey, content::ContentBody};
use sea_orm::sea_query::{DynIden, SubQueryStatement, WithClause};
use tonic::Status;

pub struct Mutation;

impl Mutation {
    /// Returns a query to store the content body.
    ///
    /// Expects the content id and event identity to be passed as (table,
    /// column) references.
    pub fn save_content_body_query(
        with: &mut WithClause,
        content_body: ContentBody,
        content_id: (DynIden, DynIden),
        event_identity: (DynIden, DynIden),
    ) -> Result<Option<SubQueryStatement>, Status> {
        Ok(Some(match content_body {
            ContentBody::Post(post) => post::add_query(with, post, content_id).map_err(|err| {
                tracing::error!(error = %err, "failed to create query to store post content");
                Status::internal("internal server error")
            })?.into(),
            ContentBody::Delete(delete) => delete::add_query(delete, content_id)?.into(),
            ContentBody::Follow(follow) => follow::add_query(follow, content_id).map_err(|err| {
                tracing::error!(error = %err, "failed to create query to store follow content");
                Status::internal("internal server error")
            })?.into(),
            ContentBody::Block(block) => block::add_query(block, content_id).map_err(|err| {
                tracing::error!(error = %err, "failed to create query to store block content");
                Status::internal("internal server error")
            })?.into(),
            ContentBody::Reaction(reaction) => reaction::add_query(reaction, content_id)?.into(),
            ContentBody::AttributedToReaction(reaction) => attributed_to_reaction::add_query(reaction, content_id)?.into(),
            ContentBody::ProfileUpdate(update) => profile_update::add_query(update, content_id)?.into(),
            ContentBody::Identity(identity) => identity::add_query(identity, content_id, event_identity)?.into(),
            ContentBody::Repost(repost) => return repost::add_query(repost, content_id).map(|q| q.map(Into::into)),
            ContentBody::Report(report) => report::add_query(report, content_id)?.into(),
            ContentBody::Labels(labels) => labels::add_query(with, labels, content_id)?.into(),
            ContentBody::VerificationClaim(claim) => verification_claim::add_query(with, claim, content_id)?.into(),
            ContentBody::VerificationTarget(target) => return verification_target::add_query(with, target, content_id).map(|q| q.map(Into::into)),
            ContentBody::VerificationVerify(verify) => verification_verify::add_query(verify, content_id)?.into(),
        }))
    }
}

/// The five denormalized `EventKey` columns shared by several tables.
#[cfg_attr(test, derive(Debug))]
pub struct EventKeyParts {
    pub collection: i16,
    pub identity: String,
    pub public_key_type: i16,
    pub public_key: Vec<u8>,
    pub sequence: i64,
}

/// Split an `EventKey` and its signer into denormalized parts, erroring
/// if either is absent. `subject` names the content type for the message.
pub fn split_event_key(
    key: Option<EventKey>,
    subject: &str,
) -> Result<EventKeyParts, Status> {
    let key = key.ok_or_else(|| {
        Status::invalid_argument(format!("{subject} missing event_key"))
    })?;
    let signed_by = key.signed_by.ok_or_else(|| {
        Status::invalid_argument(format!(
            "{subject} event_key missing signed_by"
        ))
    })?;
    Ok(EventKeyParts {
        collection: key.collection as i16,
        identity: key.identity,
        public_key_type: signed_by.key_type as i16,
        public_key: signed_by.key,
        sequence: key.sequence as i64,
    })
}

/// Deconstructed [`EventKey`].
pub struct DeconstructedEventKey {
    collection: Option<i32>,
    identity: Option<String>,
    public_key_type: Option<i32>,
    public_key: Option<Vec<u8>>,
    sequence: Option<u64>,
}

/// Deconstruct an optional `EventKey` into its fields (all optional).
/// Use [`split_event_key`] if the key is required.
fn deconstruct_event_key(event_key: Option<EventKey>) -> DeconstructedEventKey {
    if let Some(EventKey {
        collection,
        identity,
        signed_by,
        sequence,
    }) = event_key
    {
        let (key_type, key) =
            if let Some(PublicKey { key_type, key }) = signed_by {
                (Some(key_type), Some(key))
            } else {
                (None, None)
            };
        DeconstructedEventKey {
            collection: Some(collection),
            identity: Some(identity),
            public_key_type: key_type,
            public_key: key,
            sequence: Some(sequence),
        }
    } else {
        DeconstructedEventKey {
            collection: None,
            identity: None,
            public_key_type: None,
            public_key: None,
            sequence: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::proto::PublicKey;
    use tonic::Code;

    fn event_key() -> EventKey {
        EventKey {
            collection: 8,
            identity: "alice".to_string(),
            signed_by: Some(PublicKey {
                key_type: 1,
                key: vec![0xAB, 0xCD],
            }),
            sequence: 7,
        }
    }

    #[test]
    fn split_event_key_extracts_parts() {
        let parts = split_event_key(Some(event_key()), "subject").unwrap();
        assert_eq!(parts.collection, 8);
        assert_eq!(parts.identity, "alice");
        assert_eq!(parts.public_key_type, 1);
        assert_eq!(parts.public_key, vec![0xAB, 0xCD]);
        assert_eq!(parts.sequence, 7);
    }

    #[test]
    fn split_event_key_rejects_missing_key() {
        let err = split_event_key(None, "delete content").unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
        assert!(err.message().contains("missing event_key"));
    }

    #[test]
    fn split_event_key_rejects_missing_signer() {
        let mut key = event_key();
        key.signed_by = None;
        let err = split_event_key(Some(key), "delete content").unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
        assert!(err.message().contains("missing signed_by"));
    }
}
