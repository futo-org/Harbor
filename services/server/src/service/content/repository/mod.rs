//! Repository for persisting content into its normalized child tables.
//! `Mutation::save_content_child` dispatches each `ContentBody` variant
//! to its own submodule, which owns that table's insert logic.

use std::time::Duration;

use entity::{
    blob_prune_prefix, content, content_blob, content_delete, content_image,
    event,
};
use sea_orm::entity::prelude::DateTimeWithTimeZone;
use sea_orm::sea_query::{
    CommonTableExpression, DynIden, Expr, ExprTrait, Order, SelectStatement,
    SubQueryStatement, UnionType, UpdateStatement, WithClause,
};
use sea_orm::{ColumnTrait, DbErr};
use tonic::Status;

use crate::db::Connection;
use crate::service::proto::{EventKey, PublicKey, content::ContentBody};

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
            ContentBody::Labels(labels) => return labels::add_query(with, labels, content_id).map(|q| q.map(Into::into)),
            ContentBody::VerificationClaim(claim) => verification_claim::add_query(with, claim, content_id)?.into(),
            ContentBody::VerificationTarget(target) => return verification_target::add_query(with, target, content_id).map(|q| q.map(Into::into)),
            ContentBody::VerificationVerify(verify) => verification_verify::add_query(verify, content_id)?.into(),
        }))
    }
}

pub struct Query;

impl Query {
    pub(crate) async fn blob_prune_next_prefix<C: Connection>(
        db: &mut C,
        since_last_checked: Duration,
        last_prefix: Option<&str>,
    ) -> Result<Option<String>, DbErr> {
        let mut query = SelectStatement::new();
        query
            .expr(Expr::col(blob_prune_prefix::Column::Prefix.as_column_ref()))
            .from(blob_prune_prefix::Entity)
            .and_where(
                Expr::current_timestamp()
                    .sub(Expr::col(
                        blob_prune_prefix::Column::LastChecked.as_column_ref(),
                    ))
                    // SeaORM doesn't support passing Duration, so we need to do
                    // it ourselves. Second precision is fine here.
                    .gt(Expr::cust_with_values(
                        "make_interval(secs => $1)",
                        [since_last_checked.as_secs()],
                    )),
            )
            .order_by(
                blob_prune_prefix::Column::Prefix.as_column_ref(),
                Order::Asc,
            )
            .limit(1);

        if let Some(last_prefix) = last_prefix {
            query.and_where(
                Expr::col(blob_prune_prefix::Column::Prefix.as_column_ref())
                    .gt(last_prefix),
            );
        }

        match db.query_one(&query).await? {
            Some(row) => Ok(Some(row.try_get_by(0)?)),
            None => Ok(None),
        }
    }

    /// Returns the timestamp of the blob prefix that is least recently run.
    pub(crate) async fn blob_prune_least_recent_run<C: Connection>(
        db: &mut C,
    ) -> Result<Option<DateTimeWithTimeZone>, DbErr> {
        let mut query = SelectStatement::new();
        query
            .expr(
                Expr::col(
                    blob_prune_prefix::Column::LastChecked.as_column_ref(),
                )
                .min(),
            )
            .from(blob_prune_prefix::Entity);
        match db.query_one(&query).await? {
            Some(row) => Ok(Some(row.try_get_by(0)?)),
            None => Ok(None),
        }
    }

    /// Mark the `prefix` as just processed.
    pub(crate) async fn blob_prune_processed_prefix<C: Connection>(
        db: &mut C,
        prefix: &str,
    ) -> Result<(), DbErr> {
        let mut query = UpdateStatement::new();
        query
            .table(blob_prune_prefix::Entity)
            .value(
                blob_prune_prefix::Column::LastChecked,
                Expr::current_timestamp(),
            )
            .and_where(blob_prune_prefix::Column::Prefix.eq(prefix));
        db.execute(&query).await?;
        Ok(())
    }

    /// Check if an non-deleted event exists that references a blob with the
    /// given digest type and bytes.
    pub(crate) async fn blob_has_event<C: Connection>(
        db: &mut C,
        digest_type: i32,
        digest_bytes: &[u8],
    ) -> Result<bool, DbErr> {
        let mut select_content_image_id = SelectStatement::new();
        select_content_image_id
            .column(content_image::Column::ContentId)
            .from(content_image::Entity)
            .and_where(
                Expr::col(
                    content_image::Column::BlobDigestType.as_column_ref(),
                )
                .eq(Expr::Value(digest_type.into())),
            )
            .and_where(
                Expr::col(
                    content_image::Column::BlobDigestBytes.as_column_ref(),
                )
                .eq(Expr::Value(digest_bytes.into())),
            );

        let mut select_content_blob_id = SelectStatement::new();
        select_content_blob_id
            .column(content_blob::Column::ContentId)
            .from(content_blob::Entity)
            .and_where(
                Expr::col(content_blob::Column::DigestType.as_column_ref())
                    .eq(Expr::cust("$1")),
            )
            .and_where(
                Expr::col(content_blob::Column::DigestBytes.as_column_ref())
                    .eq(Expr::cust("$2")),
            )
            .union(UnionType::All, select_content_image_id);

        let mut with = WithClause::new();
        let mut cte = CommonTableExpression::new();
        const BLOB_CONTENT: &str = "blob_content";
        cte.table_name(BLOB_CONTENT).query(select_content_blob_id);
        with.cte(cte);

        let mut query = SelectStatement::new();
        query
            .expr_as(Expr::Constant(true.into()), "has_event")
            .from(BLOB_CONTENT)
            .left_join(
                content::Entity,
                Expr::col(content::Column::Id.as_column_ref()).eq(Expr::col((
                    BLOB_CONTENT,
                    content_image::Column::ContentId,
                ))),
            )
            .left_join(
                event::Entity,
                Expr::col(event::Column::ContentDigestType.as_column_ref())
                    .eq(Expr::col(content::Column::DigestType))
                    .and(
                        Expr::col(
                            event::Column::ContentDigestBytes.as_column_ref(),
                        )
                        .eq(Expr::col(content::Column::DigestBytes)),
                    ),
            )
            // Event is not deleted.
            .left_join(
                content_delete::Entity,
                Expr::col(event::Column::Collection.as_column_ref())
                    .eq(Expr::col(
                        content_delete::Column::EventKeyCollection
                            .as_column_ref(),
                    ))
                    .and(
                        Expr::col(event::Column::Identity.as_column_ref()).eq(
                            Expr::col(
                                content_delete::Column::EventKeyIdentity
                                    .as_column_ref(),
                            ),
                        ),
                    )
                    .and(
                        Expr::col(event::Column::PublicKeyType.as_column_ref())
                            .eq(Expr::col(
                                content_delete::Column::EventKeyPublicKeyType
                                    .as_column_ref(),
                            )),
                    )
                    .and(
                        Expr::col(event::Column::PublicKey.as_column_ref()).eq(
                            Expr::col(
                                content_delete::Column::EventKeyPublicKey
                                    .as_column_ref(),
                            ),
                        ),
                    )
                    .and(
                        Expr::col(event::Column::Sequence.as_column_ref()).eq(
                            Expr::col(
                                content_delete::Column::EventKeySequence
                                    .as_column_ref(),
                            ),
                        ),
                    ),
            )
            .and_where(Expr::col(content_delete::Entity).is_null());
        let query = query.with(with);

        let result = db.query_one(&query).await?;
        let Some(row) = result else {
            return Ok(false);
        };
        row.try_get_by(0)
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
