//! Repository for persisting content into its normalized child tables.
//! `Mutation::save_content_child` dispatches each `ContentBody` variant
//! to its own submodule, which owns that table's insert logic.

use std::time::Duration;

use entity::{
    blob_index, content, content_blob, content_delete, content_image, event,
};
use polycentric_common::models::protos_v2::{
    Blob, ContentDigest, Image, ImageSet,
};
use sea_orm::entity::prelude::DateTimeWithTimeZone;
use sea_orm::sea_query::extension::postgres::PgExpr;
use sea_orm::sea_query::{
    CommonTableExpression, DeleteStatement, DynIden, Expr, ExprTrait, Func,
    InsertStatement, SelectStatement, SubQueryStatement, Value, ValueType,
    WithClause,
};
use sea_orm::{ColumnTrait, DbErr};
use tonic::Status;

use crate::db::{Connection, interval};
use crate::service::proto::{EventKey, PublicKey, content::ContentBody};

mod attributed_to_reaction;
mod block;
mod calendar_event;
mod calendar_event_rsvp;
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
            ContentBody::ProfileUpdate(update) => profile_update::add_query(with, update, content_id)?.into(),
            ContentBody::Identity(identity) => identity::add_query(identity, content_id, event_identity)?.into(),
            ContentBody::Repost(repost) => return repost::add_query(repost, content_id).map(|q| q.map(Into::into)),
            ContentBody::Report(report) => report::add_query(report, content_id)?.into(),
            ContentBody::Labels(labels) => return labels::add_query(with, labels, content_id).map(|q| q.map(Into::into)),
            ContentBody::VerificationClaim(claim) => verification_claim::add_query(with, claim, content_id)?.into(),
            ContentBody::VerificationTarget(target) => return verification_target::add_query(with, target, content_id).map(|q| q.map(Into::into)),
            ContentBody::VerificationVerify(verify) => verification_verify::add_query(verify, content_id)?.into(),
            ContentBody::CalendarEvent(event) => calendar_event::add_query(with, event, content_id)?.into(),
            ContentBody::CalendarEventRsvp(rsvp) => calendar_event_rsvp::add_query(rsvp, content_id)?.into(),
        }))
    }

    /// Removes all blobs with a key in `keys` from the index.
    pub(crate) async fn remove_blobs<C: Connection>(
        db: &mut C,
        to_remove: Vec<(String, ContentDigest)>,
    ) -> Result<(), DbErr> {
        let mut keys = Vec::with_capacity(to_remove.len());
        let mut digest_types = Vec::with_capacity(to_remove.len());
        let mut digest_values = Vec::with_capacity(to_remove.len());
        for (key, ContentDigest { r#type, value }) in to_remove {
            keys.push(key);
            digest_types.push(Value::from(r#type));
            digest_values.push(Value::from(value));
        }

        let mut delete_from_index = DeleteStatement::new();
        delete_from_index.from_table(blob_index::Entity).and_where(
            Expr::col(blob_index::Column::Key.as_column_ref()).eq_any(keys),
        );

        let mut delete_from_content = DeleteStatement::new();
        delete_from_content
            .from_table(content_blob::Entity)
            .and_where(
                Expr::tuple([
                    Expr::col(content_blob::Column::DigestType.as_column_ref()),
                    Expr::col(
                        content_blob::Column::DigestBytes.as_column_ref(),
                    ),
                ])
                .in_subquery({
                    let mut q = SelectStatement::new();
                    q.expr(Func::cust("UNNEST").arg(Value::Array(
                        <i32 as ValueType>::array_type(),
                        Some(Box::new(digest_types)),
                    )))
                    .expr(Func::cust("UNNEST").arg(
                        Value::Array(
                            <Vec<u8> as ValueType>::array_type(),
                            Some(Box::new(digest_values)),
                        ),
                    ));
                    q
                }),
            );

        let mut with = WithClause::new();
        let mut cte = CommonTableExpression::new();
        cte.table_name("delete_from_content_blob")
            .query(delete_from_content);
        with.cte(cte);
        let query = delete_from_index.with(with);

        db.execute(&query).await?;
        Ok(())
    }

    /// Subquery to store image sets into the `content_image` table.
    fn store_image_sets(
        images: Vec<ImageSet>,
        content_id: (DynIden, DynIden),
    ) -> Result<Option<InsertStatement>, DbErr> {
        if images.is_empty() {
            return Ok(None);
        }

        let mut digest_types = Vec::new();
        let mut digest_bytes = Vec::new();
        let mut sizes = Vec::new();
        let mut mime_types = Vec::new();
        let mut widths = Vec::new();
        let mut heights = Vec::new();

        for set in images {
            let ImageSet { images } = set;
            for image in images {
                // NOTE: before this is called the post should be validated,
                // which check if all these fields below are some. So the we can
                // safely continue if any of them are none as that should not
                // happen in practice.
                #[rustfmt::skip]
                let Image { blob, width, height } = image;
                #[rustfmt::skip]
                let Some(Blob { digest, mime_type, size }) = blob else { continue; };
                #[rustfmt::skip]
                let Some(ContentDigest { r#type, value }) = digest else { continue; };
                digest_types.push(r#type);
                digest_bytes.push(value);
                sizes.push(size);
                mime_types.push(mime_type);
                widths.push(width);
                heights.push(height);
            }
        }

        let mut query = InsertStatement::new();
        query
            .into_table(content_image::Entity)
            .columns([
                content_image::Column::ContentId,
                content_image::Column::DigestType,
                content_image::Column::DigestBytes,
                content_image::Column::Size,
                content_image::Column::MimeType,
                content_image::Column::Width,
                content_image::Column::Height,
            ])
            .select_from({
                let mut q = SelectStatement::new();
                q.from(content_id.0.clone())
                    .expr(Expr::col(content_id))
                    // NOTE: this can be one UNNEST call, but SeaORM doesn't
                    // like that.
                    .expr(Expr::cust_with_expr("UNNEST($1)", digest_types))
                    .expr(Expr::cust_with_expr("UNNEST($1)", digest_bytes))
                    .expr(Expr::cust_with_expr("UNNEST($1)", sizes))
                    .expr(Expr::cust_with_expr("UNNEST($1)", mime_types))
                    .expr(Expr::cust_with_expr("UNNEST($1)", widths))
                    .expr(Expr::cust_with_expr("UNNEST($1)", heights));
                q
            })
            .map_err(|err| {
                DbErr::Custom(format!("incorrect amount of values: {err}"))
            })?;

        Ok(Some(query))
    }
}

pub struct Query;

impl Query {
    /// Returns the keys of blobs that are not used.
    #[allow(unused)] // TODO(Thomas): remove.
    pub(crate) async fn list_unused_blobs<C: Connection>(
        db: &mut C,
        grace_period: Duration,
    ) -> Result<Vec<(String, ContentDigest)>, DbErr> {
        let mut live_blobs = SelectStatement::new();
        live_blobs
            .expr(Expr::col(content_image::Column::DigestType.as_column_ref()))
            .expr(Expr::col(
                content_image::Column::DigestBytes.as_column_ref(),
            ))
            .from(content_image::Entity)
            .inner_join(
                content::Entity,
                Expr::col(content::Column::Id.as_column_ref()).eq(Expr::col(
                    content_image::Column::ContentId.as_column_ref(),
                )),
            )
            .inner_join(
                event::Entity,
                Expr::col(event::Column::ContentDigestType.as_column_ref())
                    .eq(Expr::col(content::Column::DigestType.as_column_ref()))
                    .and(
                        Expr::col(
                            event::Column::ContentDigestBytes.as_column_ref(),
                        )
                        .eq(Expr::col(
                            content::Column::DigestBytes.as_column_ref(),
                        )),
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

        let mut query = SelectStatement::new();
        query
            .expr(Expr::col(blob_index::Column::Key.as_column_ref()))
            .expr(Expr::col(blob_index::Column::DigestType.as_column_ref()))
            .expr(Expr::col(blob_index::Column::DigestValue.as_column_ref()))
            .from(blob_index::Entity)
            .and_where(
                Expr::col(blob_index::Column::LastModified)
                    .lte(Expr::current_timestamp().sub(interval(grace_period))),
            )
            .and_where(
                Expr::tuple([
                    Expr::col(blob_index::Column::DigestType.as_column_ref()),
                    Expr::col(blob_index::Column::DigestValue.as_column_ref()),
                ])
                .not_in_subquery(live_blobs),
            );

        db.query_all(&query)
            .await?
            .into_iter()
            .map(|row| {
                Ok((
                    row.try_get_by(0)?,
                    ContentDigest {
                        r#type: row.try_get_by(1)?,
                        value: row.try_get_by(2)?,
                    },
                ))
            })
            .collect()
    }

    /// Returns the timestamp of the latest last modified timestamp.
    pub(crate) async fn blob_recent_modified<C: Connection>(
        db: &mut C,
    ) -> Result<Option<DateTimeWithTimeZone>, DbErr> {
        let mut query = SelectStatement::new();
        query
            .expr(
                Expr::col(blob_index::Column::LastModified.as_column_ref())
                    .max(),
            )
            .from(blob_index::Entity);
        match db.query_one(&query).await? {
            Some(row) => Ok(row.try_get_by(0)?),
            None => Ok(None),
        }
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
