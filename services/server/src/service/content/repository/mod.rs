//! Repository for persisting content into its normalized child tables.
//! `Mutation::save_content_child` dispatches each `ContentBody` variant
//! to its own submodule, which owns that table's insert logic.

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

use crate::service::proto::{Content, EventKey, content::ContentBody};
use sea_orm::ConnectionTrait;
use tonic::Status;

pub struct Mutation;

impl Mutation {
    /// Persist the normalized child row(s) for a content body.
    pub async fn save_content_child<C: ConnectionTrait>(
        db: &C,
        content_id: i64,
        content: Content,
        event_identity: &str,
    ) -> Result<(), Status> {
        let ctx = ChildContext {
            content_id,
            event_identity,
        };
        match content.content_body {
            Some(ContentBody::Post(x)) => post::add(db, &ctx, x).await,
            Some(ContentBody::Delete(x)) => delete::add(db, &ctx, x).await,
            Some(ContentBody::Follow(x)) => follow::add(db, &ctx, x).await,
            Some(ContentBody::Block(x)) => block::add(db, &ctx, x).await,
            Some(ContentBody::Reaction(x)) => reaction::add(db, &ctx, x).await,
            Some(ContentBody::ProfileUpdate(x)) => {
                profile_update::add(db, &ctx, x).await
            }
            Some(ContentBody::Identity(x)) => identity::add(db, &ctx, x).await,
            Some(ContentBody::Repost(x)) => repost::add(db, &ctx, x).await,
            Some(ContentBody::Report(x)) => report::add(db, &ctx, x).await,
            Some(ContentBody::Labels(x)) => labels::add(db, &ctx, x).await,
            Some(ContentBody::VerificationClaim(x)) => {
                verification_claim::add(db, &ctx, x).await
            }
            Some(ContentBody::VerificationTarget(x)) => {
                verification_target::add(db, &ctx, x).await
            }
            Some(ContentBody::VerificationVerify(x)) => {
                verification_verify::add(db, &ctx, x).await
            }
            None => Ok(()),
        }
    }
}

struct ChildContext<'a> {
    content_id: i64,
    event_identity: &'a str,
}

/// Log a DB error and map it to an opaque internal status.
fn map_db_err(e: sea_orm::DbErr) -> Status {
    eprintln!("save_content_child db error: {e}");
    Status::internal("internal server error")
}

/// The five denormalized `EventKey` columns shared by several tables.
#[cfg_attr(test, derive(Debug))]
struct EventKeyParts {
    collection: i16,
    identity: String,
    public_key_type: i16,
    public_key: Vec<u8>,
    sequence: i64,
}

/// Split an `EventKey` and its signer into denormalized parts, erroring
/// if either is absent. `subject` names the content type for the message.
fn split_event_key(
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::proto::{Delete, PublicKey};
    use sea_orm::{DatabaseBackend, MockDatabase};
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

    #[tokio::test]
    async fn save_content_child_none_is_noop() {
        let db = MockDatabase::new(DatabaseBackend::Postgres).into_connection();
        let content = Content { content_body: None };
        Mutation::save_content_child(&db, 1, content, "alice")
            .await
            .unwrap();
        assert!(db.into_transaction_log().is_empty());
    }

    #[tokio::test]
    async fn save_content_child_validates_before_touching_db() {
        let db = MockDatabase::new(DatabaseBackend::Postgres).into_connection();
        let content = Content {
            content_body: Some(ContentBody::Delete(Delete { event_key: None })),
        };
        let err = Mutation::save_content_child(&db, 1, content, "alice")
            .await
            .unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
        assert!(db.into_transaction_log().is_empty());
    }
}
