use crate::service::content::repository::split_event_key;
use ::entity::block_model as BlockModel;
use ::entity::content_model as ContentModel;
use ::entity::event_model as EventModel;
use ::entity::follow_model as FollowModel;
use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::content::ContentBody;
use polycentric_common::models::protos_v2::{
    Block, Content, Delete, EventKey, Follow, Post,
};
use sea_orm::sea_query::{
    DeleteStatement, Expr, InsertStatement, IntoCondition, IntoTableRef,
    SelectStatement,
};
use sea_orm::*;

const COLLECTION_FEED: i16 = collections::FEED as i16;
const COLLECTION_SOCIAL: i16 = collections::SOCIAL_GRAPH as i16;

pub struct Query;

impl Query {
    #[allow(clippy::too_many_arguments)]
    pub async fn list_events(
        db: &DbConn,
        mut limit: Option<u64>,
        collection: Option<i32>,
        identity: Option<String>,
        signed_by: Option<crate::service::proto::PublicKey>,
        sequence_gt: Option<i64>,
        sequence_lt: Option<i64>,
        heads: Vec<EventKey>,
    ) -> Result<Vec<(EventModel::Model, Option<ContentModel::Model>)>, DbErr>
    {
        if limit > Some(200) || limit.is_none() {
            limit = Some(200);
        }

        let mut query = EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(
                JoinType::LeftJoin,
                EventModel::Entity::belongs_to(ContentModel::Entity)
                    .from(EventModel::Column::ContentDigestType)
                    .to(ContentModel::Column::DigestType)
                    .on_condition(|event_tbl, content_tbl| {
                        Expr::col((
                            event_tbl,
                            EventModel::Column::ContentDigestBytes,
                        ))
                        .equals((
                            content_tbl,
                            ContentModel::Column::DigestBytes,
                        ))
                        .into_condition()
                    })
                    .into(),
            );

        if let Some(c) = collection {
            query = query.filter(EventModel::Column::Collection.eq(c as i16));
        }

        if let Some(id) = identity {
            query = query.filter(EventModel::Column::Identity.eq(id));
        }

        if let Some(pk) = signed_by {
            query = query.filter(
                Condition::all()
                    .add(
                        EventModel::Column::PublicKeyType
                            .eq(pk.key_type as i16),
                    )
                    .add(EventModel::Column::PublicKey.eq(pk.key)),
            );
        }

        if let Some(gt) = sequence_gt {
            query = query.filter(EventModel::Column::Sequence.gt(gt));
        }

        if let Some(lt) = sequence_lt {
            query = query.filter(EventModel::Column::Sequence.lt(lt));
        }

        for head in heads {
            let Some(signer) = head.signed_by else {
                continue;
            };

            // Require the event to either
            // (1) mismatch the head's collection, signer, or identity
            // (2) have a larger sequence number than the head
            query = query.filter(
                Condition::any()
                    .add(
                        EventModel::Column::Collection
                            .ne(head.collection as i16),
                    )
                    .add(EventModel::Column::Identity.ne(head.identity))
                    .add(
                        EventModel::Column::PublicKeyType
                            .ne(signer.key_type as i16),
                    )
                    .add(EventModel::Column::PublicKey.ne(signer.key))
                    .add(EventModel::Column::Sequence.gt(head.sequence as i64)),
            )
        }

        query
            .order_by_desc(EventModel::Column::Sequence)
            .limit(limit)
            .all(db)
            .await
    }

    /// Find the latest sequence numbers for an identity
    pub async fn list_heads(
        db: &DbConn,
        identity: &str,
    ) -> Result<Vec<HeadInfoRow>, DbErr> {
        EventModel::Entity::find()
            .select_only()
            .filter(EventModel::Column::Identity.eq(identity))
            .column(EventModel::Column::PublicKeyType)
            .column(EventModel::Column::PublicKey)
            .column(EventModel::Column::Collection)
            .column_as(EventModel::Column::Sequence.max(), "max_seq")
            .group_by(EventModel::Column::PublicKeyType)
            .group_by(EventModel::Column::PublicKey)
            .group_by(EventModel::Column::Collection)
            .into_model::<HeadInfoRow>()
            .all(db)
            .await
    }
}

#[derive(Debug, FromQueryResult)]
pub struct HeadInfoRow {
    pub public_key_type: i16,
    pub public_key: Vec<u8>,
    pub collection: i16,
    pub max_seq: i64,
}

pub struct Mutation;

impl Mutation {
    pub async fn add_event<C: ConnectionTrait>(
        db: &C,
        active_model: EventModel::ActiveModel,
        content: Option<&Content>,
    ) -> Result<(), DbErr> {
        let event = active_model.insert(db).await?;

        let Some(Content {
            content_body: Some(body),
        }) = content
        else {
            return Ok(());
        };
        match body {
            ContentBody::Post(post) => Mutation::post(db, &event, post).await,
            ContentBody::Follow(follow) => {
                Mutation::follow(db, &event, follow).await
            }
            ContentBody::Block(block) => {
                Mutation::block(db, &event, block).await
            }
            ContentBody::Delete(delete) => {
                Mutation::delete(db, &event, delete).await
            }
            _ => Ok(()),
        }
    }

    async fn post<C: ConnectionTrait>(
        db: &C,
        event: &EventModel::Model,
        _: &Post,
    ) -> Result<(), DbErr> {
        let mut query = InsertStatement::new();
        query
            .into_table("reaction_tally")
            .columns(["event_id", "positive_count", "negative_count"])
            .values([Expr::from(event.id), Expr::from(0), Expr::from(0)])
            .map_err(|err| {
                DbErr::Custom(format!("incorrect amount of values: {err}"))
            })?;
        db.execute(&query).await?;
        Ok(())
    }

    async fn follow<C: ConnectionTrait>(
        db: &C,
        event: &EventModel::Model,
        follow: &Follow,
    ) -> Result<(), DbErr> {
        FollowModel::ActiveModel {
            event_id: Set(event.id),
            follower: Set(event.identity.clone()),
            followee: Set(follow.identity.clone()),
        }
        .insert(db)
        .await?;

        Ok(())
    }

    async fn block<C: ConnectionTrait>(
        db: &C,
        event: &EventModel::Model,
        block: &Block,
    ) -> Result<(), DbErr> {
        BlockModel::ActiveModel {
            event_id: Set(event.id),
            blocker: Set(event.identity.clone()),
            blocked: Set(block.identity.clone()),
        }
        .insert(db)
        .await?;
        Ok(())
    }

    async fn delete<C: ConnectionTrait>(
        db: &C,
        event: &EventModel::Model,
        delete: &Delete,
    ) -> Result<(), DbErr> {
        let key = split_event_key(delete.event_key.clone(), "delete content")
            .map_err(|err| DbErr::Custom(err.message().into()))?;

        // An identity may only delete its own events
        if key.identity != event.identity {
            return Ok(());
        }

        let mut event_id = SelectStatement::new();
        event_id
            .column(EventModel::Column::Id)
            .from(EventModel::Entity)
            .and_where(EventModel::Column::Collection.eq(key.collection))
            .and_where(EventModel::Column::Identity.eq(key.identity))
            .and_where(
                EventModel::Column::PublicKeyType.eq(key.public_key_type),
            )
            .and_where(EventModel::Column::PublicKey.eq(key.public_key))
            .and_where(EventModel::Column::Sequence.eq(key.sequence));

        match key.collection {
            // Deletion of a post.
            COLLECTION_FEED => {
                delete_cached_rows(db, "reaction_tally", &event_id).await?;
            }
            // Deletion of a following or of a block. The event key does not
            // say which, so clear both caches
            COLLECTION_SOCIAL => {
                delete_cached_rows(db, FollowModel::Entity, &event_id).await?;
                delete_cached_rows(db, BlockModel::Entity, &event_id).await?;
            }
            // Nothing to delete.
            _ => return Ok(()),
        }

        Ok(())
    }
}

/// Drop the rows `table` caches for the event selected by `event_id`.
async fn delete_cached_rows<C: ConnectionTrait, T: IntoTableRef>(
    db: &C,
    table: T,
    event_id: &SelectStatement,
) -> Result<(), DbErr> {
    let mut query = DeleteStatement::new();
    query
        .from_table(table)
        .cond_where(Expr::col("event_id").in_subquery(event_id.clone()));
    db.execute(&query).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ::entity::block_model as BlockModelEntity;
    use polycentric_common::models::protos_v2::{EventKey, PublicKey};
    use sea_orm::prelude::TimeDateTimeWithTimeZone;
    use sea_orm::{
        DatabaseConnection, DbBackend, MockDatabase, MockExecResult,
    };

    /// The SQL every statement the connection ran, in order.
    fn statements(db: DatabaseConnection) -> Vec<String> {
        db.into_transaction_log()
            .iter()
            .flat_map(|txn| txn.statements())
            .map(|stmt| stmt.sql.clone())
            .collect()
    }

    fn now() -> TimeDateTimeWithTimeZone {
        TimeDateTimeWithTimeZone::from_unix_timestamp(0).unwrap()
    }

    fn event_row(identity: &str) -> EventModel::Model {
        EventModel::Model {
            id: 1,
            collection: COLLECTION_SOCIAL,
            identity: identity.to_string(),
            public_key_type: 1,
            public_key: vec![0xaa],
            sequence: 1,
            content_digest_type: Some(1),
            content_digest_bytes: Some(vec![1]),
            signature: vec![],
            previous_signature: vec![],
            previous_root: vec![],
            event_bytes: vec![1],
            created_at: now(),
            synced_at: now(),
        }
    }

    fn active_event(identity: &str) -> EventModel::ActiveModel {
        event_row(identity).into_active_model()
    }

    fn block_content(blocked: &str) -> Content {
        Content {
            content_body: Some(ContentBody::Block(Block {
                identity: blocked.to_string(),
            })),
        }
    }

    fn delete_content(target_identity: &str) -> Content {
        Content {
            content_body: Some(ContentBody::Delete(Delete {
                event_key: Some(EventKey {
                    collection: collections::SOCIAL_GRAPH,
                    identity: target_identity.to_string(),
                    signed_by: Some(PublicKey {
                        key_type: 1,
                        key: vec![0xaa],
                    }),
                    sequence: 1,
                }),
            })),
        }
    }

    #[tokio::test]
    async fn a_block_event_is_cached_in_the_block_table() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![event_row("alice")]])
            .append_query_results([vec![BlockModelEntity::Model {
                event_id: 1,
                blocker: "alice".to_string(),
                blocked: "bob".to_string(),
            }]])
            .into_connection();

        Mutation::add_event(
            &db,
            active_event("alice"),
            Some(&block_content("bob")),
        )
        .await
        .unwrap();

        let statements = statements(db);
        assert_eq!(statements.len(), 2);
        assert!(statements[1].contains("INSERT INTO \"block\""));
    }

    #[tokio::test]
    async fn deleting_a_graph_event_clears_both_graph_caches() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![event_row("alice")]])
            .append_exec_results([
                MockExecResult::default(),
                MockExecResult::default(),
            ])
            .into_connection();

        Mutation::add_event(
            &db,
            active_event("alice"),
            Some(&delete_content("alice")),
        )
        .await
        .unwrap();

        let statements = statements(db);
        assert_eq!(statements.len(), 3);
        assert!(statements[1].contains("DELETE FROM \"follow\""));
        assert!(statements[2].contains("DELETE FROM \"block\""));
    }

    #[tokio::test]
    async fn a_delete_of_another_identitys_event_is_ignored() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![event_row("mallory")]])
            .into_connection();

        Mutation::add_event(
            &db,
            active_event("mallory"),
            Some(&delete_content("alice")),
        )
        .await
        .unwrap();

        // Only the event insert ran: no cache row was dropped.
        assert_eq!(statements(db).len(), 1);
    }
}
