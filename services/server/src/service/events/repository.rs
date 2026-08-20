use crate::service::content::repository::{EventKeyParts, split_event_key};
use ::entity::content_delete_model as ContentDeleteModel;
use ::entity::content_model as ContentModel;
use ::entity::event_model as EventModel;
use ::entity::follow_model as FollowModel;
use ::entity::quote_model as QuoteModel;
use ::entity::reply_model as ReplyModel;
use ::entity::repost_model as RepostModel;
use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::content::ContentBody;
use polycentric_common::models::protos_v2::{
    Content, Delete, EventKey, Follow, Post, Reaction, Repost,
};
use sea_orm::sea_query::{
    CommonTableExpression, DeleteStatement, Expr, InsertStatement,
    IntoColumnRef, IntoCondition, SelectExpr, SelectStatement, UpdateStatement,
    WithClause,
};
use sea_orm::*;

const COLLECTION_FEED: i16 = collections::FEED as i16;
const COLLECTION_SOCIAL: i16 = collections::SOCIAL_GRAPH as i16;
const COLLECTION_INTERACTIONS: i16 = collections::INTERACTIONS as i16;

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
    ) -> Result<EventModel::Model, DbErr> {
        active_model.insert(db).await
    }

    /// Update the cache tables based on a new `event` and its `content`.
    ///
    /// Caller must ensure that the `event` is authorised, i.e. not an event
    /// created by identity A that is deleting an event of identity B.
    pub async fn update_cache<C: ConnectionTrait>(
        db: &C,
        event: &EventModel::Model,
        content: Option<&Content>,
    ) -> Result<(), DbErr> {
        let Some(Content {
            content_body: Some(body),
        }) = content
        else {
            return Ok(());
        };

        match body {
            ContentBody::Post(post) => Mutation::post(db, event, post).await,
            ContentBody::Follow(follow) => {
                Mutation::follow(db, event, follow).await
            }
            ContentBody::Reaction(reaction) => {
                Mutation::reaction(db, event, reaction).await
            }
            ContentBody::Repost(repost) => {
                Mutation::repost(db, event, repost).await
            }
            ContentBody::Delete(delete) => Mutation::delete(db, delete).await,
            _ => Ok(()),
        }
    }

    async fn post<C: ConnectionTrait>(
        db: &C,
        event: &EventModel::Model,
        post: &Post,
    ) -> Result<(), DbErr> {
        let mut query = InsertStatement::new();
        query
            .into_table("reaction_tally")
            .columns(["event_id", "positive_count", "negative_count"])
            .values([
                Expr::from(event.id),
                Expr::Constant(0.into()),
                Expr::Constant(0.into()),
            ])
            .map_err(|err| {
                DbErr::Custom(format!("incorrect amount of values: {err}"))
            })?;

        if let Some(quote) = post.quote.as_ref() {
            let key = split_event_key(Some(quote.clone()), "quote")
                .map_err(|err| DbErr::Custom(err.message().into()))?;
            let mut post_event_id = select_not_deleted_event_id(key);

            let mut insert_quote = InsertStatement::new();
            insert_quote
                .into_table(QuoteModel::Entity)
                .columns([
                    QuoteModel::Column::EventId,
                    QuoteModel::Column::Identity,
                    QuoteModel::Column::Post,
                ])
                .select_from({
                    post_event_id
                        .clear_selects() // Need to rename.
                        .expr(SelectExpr {
                            expr: Expr::from(event.id),
                            alias: Some(QuoteModel::Column::EventId.into()),
                            window: None,
                        })
                        .expr(SelectExpr {
                            expr: Expr::from(&event.identity),
                            alias: Some(QuoteModel::Column::Identity.into()),
                            window: None,
                        })
                        .expr(SelectExpr {
                            expr: Expr::Column(
                                EventModel::Column::Id.into_column_ref(),
                            ),
                            alias: Some(QuoteModel::Column::Post.into()),
                            window: None,
                        });
                    post_event_id
                })
                .map_err(|err| {
                    DbErr::Custom(format!("incorrect amount of values: {err}"))
                })?;

            query.with_cte({
                let mut c = WithClause::new();
                let mut cte = CommonTableExpression::new();
                cte.table_name("inserted_quote").query(insert_quote);
                c.recursive(false).cte(cte);
                c
            });
        }

        if let Some(reply) = post.reply.as_ref() {
            // NOTE: only adding a reply to the parent, not for the root.
            let key = split_event_key(reply.parent.clone(), "reply")
                .map_err(|err| DbErr::Custom(err.message().into()))?;
            let mut post_event_id = select_not_deleted_event_id(key);

            let mut insert_reply = InsertStatement::new();
            insert_reply
                .into_table(ReplyModel::Entity)
                .columns([
                    ReplyModel::Column::EventId,
                    ReplyModel::Column::Identity,
                    ReplyModel::Column::Post,
                ])
                .select_from({
                    post_event_id
                        .clear_selects()
                        .expr(SelectExpr {
                            expr: Expr::from(event.id),
                            alias: Some(ReplyModel::Column::EventId.into()),
                            window: None,
                        })
                        .expr(SelectExpr {
                            expr: Expr::from(&event.identity),
                            alias: Some(ReplyModel::Column::Identity.into()),
                            window: None,
                        })
                        .expr(SelectExpr {
                            expr: Expr::Column(
                                EventModel::Column::Id.into_column_ref(),
                            ),
                            alias: Some(ReplyModel::Column::Post.into()),
                            window: None,
                        });
                    post_event_id
                })
                .map_err(|err| {
                    DbErr::Custom(format!("incorrect amount of values: {err}"))
                })?;

            query.with_cte({
                let mut c = WithClause::new();
                let mut cte = CommonTableExpression::new();
                cte.table_name("inserted_reply").query(insert_reply);
                c.recursive(false).cte(cte);
                c
            });
        }

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

    async fn reaction<C: ConnectionTrait>(
        db: &C,
        event: &EventModel::Model,
        reaction: &Reaction,
    ) -> Result<(), DbErr> {
        let key = split_event_key(reaction.event_key.clone(), "reaction")
            .map_err(|err| DbErr::Custom(err.message().into()))?;
        let mut post_event_id = select_not_deleted_event_id(key);

        let mut insert_reaction = InsertStatement::new();
        insert_reaction
            .into_table("reaction")
            .columns(["event_id", "identity", "on_post", "emoji", "positive"])
            .select_from({
                post_event_id
                    .clear_selects() // Need to rename.
                    .expr(SelectExpr {
                        expr: Expr::from(event.id),
                        alias: Some("event_id".into()),
                        window: None,
                    })
                    .expr(SelectExpr {
                        expr: Expr::from(&event.identity),
                        alias: Some("identity".into()),
                        window: None,
                    })
                    .expr(SelectExpr {
                        expr: Expr::Column(
                            EventModel::Column::Id.into_column_ref(),
                        ),
                        alias: Some("on_post".into()),
                        window: None,
                    })
                    .expr(SelectExpr {
                        expr: Expr::from(reaction.emoji.clone()),
                        alias: Some("emoji".into()),
                        window: None,
                    })
                    .expr(SelectExpr {
                        expr: Expr::from(reaction.positive),
                        alias: Some("positive".into()),
                        window: None,
                    });
                post_event_id
            })
            .map_err(|err| {
                DbErr::Custom(format!("incorrect amount of values: {err}"))
            })?
            .returning_all();

        let positive = if reaction.positive { 1 } else { 0 };
        let negative = if reaction.positive { 0 } else { 1 };

        let mut query = UpdateStatement::new();
        query
            // This should be as easy as a subquery, but SeaQuery doesn't
            // support it. So we have to use CTEs.
            .with_cte({
                let mut c = WithClause::new();
                let mut cte = CommonTableExpression::new();
                cte.table_name("inserted_reaction").query(insert_reaction);
                c.recursive(false).cte(cte);
                c
            })
            .table("reaction_tally")
            .values([
                (
                    "positive_count",
                    Expr::Column(("reaction_tally", "positive_count").into())
                        .add(Expr::Constant(positive.into())),
                ),
                (
                    "negative_count",
                    Expr::Column(("reaction_tally", "negative_count").into())
                        .add(Expr::Constant(negative.into())),
                ),
            ])
            .from("inserted_reaction")
            .and_where(
                Expr::Column(("reaction_tally", "event_id").into())
                    .eq(Expr::Column(("inserted_reaction", "on_post").into())),
            );

        db.execute(&query).await?;
        Ok(())
    }

    async fn repost<C: ConnectionTrait>(
        db: &C,
        event: &EventModel::Model,
        repost: &Repost,
    ) -> Result<(), DbErr> {
        let key = split_event_key(repost.post.clone(), "repost")
            .map_err(|err| DbErr::Custom(err.message().into()))?;
        let mut post_event_id = select_not_deleted_event_id(key);

        let mut query = InsertStatement::new();
        query
            .into_table(RepostModel::Entity)
            .columns([
                RepostModel::Column::EventId,
                RepostModel::Column::Identity,
                RepostModel::Column::Post,
            ])
            .select_from({
                post_event_id
                    .clear_selects() // Need to rename.
                    .expr(SelectExpr {
                        expr: Expr::from(event.id),
                        alias: Some(RepostModel::Column::EventId.into()),
                        window: None,
                    })
                    .expr(SelectExpr {
                        expr: Expr::from(&event.identity),
                        alias: Some(RepostModel::Column::Identity.into()),
                        window: None,
                    })
                    .expr(SelectExpr {
                        expr: Expr::col(EventModel::Column::Id.as_column_ref()),
                        alias: Some(RepostModel::Column::Post.into()),
                        window: None,
                    });
                post_event_id
            })
            .map_err(|err| {
                DbErr::Custom(format!("incorrect amount of values: {err}"))
            })?;

        db.execute(&query).await?;
        Ok(())
    }

    async fn delete<C: ConnectionTrait>(
        db: &C,
        delete: &Delete,
    ) -> Result<(), DbErr> {
        let key = split_event_key(delete.event_key.clone(), "delete content")
            .map_err(|err| DbErr::Custom(err.message().into()))?;
        let collection = key.collection;
        let event_id = select_event_id(key);

        let mut query = DeleteStatement::new();
        match collection {
            // Deletion of a post.
            COLLECTION_FEED => {
                let mut with = WithClause::new();
                let mut cte = CommonTableExpression::new();
                cte.table_name("event_id").query(event_id);
                with.recursive(false).cte(cte);

                // Delete the tally for the post.
                let mut delete_reaction_tally = query;
                delete_reaction_tally
                    .from_table("reaction_tally")
                    .cond_where(Expr::col("event_id").in_subquery({
                        let mut q = SelectStatement::new();
                        q.column("id").from("event_id");
                        q
                    }));
                let mut cte = CommonTableExpression::new();
                cte.table_name("deleted_reaction_tally")
                    .query(delete_reaction_tally);
                with.cte(cte);

                // Delete quotes from the posts itself and quoting the deleted
                // post.
                let mut delete_quotes = DeleteStatement::new();
                delete_quotes.from_table(QuoteModel::Entity).cond_where(
                    Condition::any()
                        // The now deleted post qouting another post.
                        .add(
                            Expr::col(QuoteModel::Column::EventId).in_subquery(
                                {
                                    let mut q = SelectStatement::new();
                                    q.column("id").from("event_id");
                                    q
                                },
                            ),
                        )
                        // The now deleted post being qouted.
                        .add(Expr::col(QuoteModel::Column::Post).in_subquery(
                            {
                                let mut q = SelectStatement::new();
                                q.column("id").from("event_id");
                                q
                            },
                        )),
                );
                let mut cte = CommonTableExpression::new();
                cte.table_name("deleted_quotes").query(delete_quotes);
                with.cte(cte);

                // Delete replies from the posts itself and replying to the
                // deleted post.
                let mut delete_replies = DeleteStatement::new();
                delete_replies.from_table(ReplyModel::Entity).cond_where(
                    Condition::any()
                        // The now deleted post replying to another post.
                        .add(
                            Expr::col(ReplyModel::Column::EventId).in_subquery(
                                {
                                    let mut q = SelectStatement::new();
                                    q.column("id").from("event_id");
                                    q
                                },
                            ),
                        )
                        // The now deleted post being replied to.
                        .add(Expr::col(ReplyModel::Column::Post).in_subquery(
                            {
                                let mut q = SelectStatement::new();
                                q.column("id").from("event_id");
                                q
                            },
                        )),
                );
                let mut cte = CommonTableExpression::new();
                cte.table_name("deleted_replies").query(delete_replies);
                with.cte(cte);

                // Delete all reactions to the post.
                let mut query = DeleteStatement::new();
                query.with_cte(with).from_table("reaction").cond_where(
                    Expr::col("on_post").in_subquery({
                        let mut q = SelectStatement::new();
                        q.column("id").from("event_id");
                        q
                    }),
                );

                db.execute(&query).await?;
                return Ok(());
            }
            // Deletion of a following.
            COLLECTION_SOCIAL => {
                query.from_table(FollowModel::Entity);
            }
            // Deletion of a reaction and updating the tally.
            COLLECTION_INTERACTIONS => {
                let mut delete_reaction = query;
                delete_reaction
                    .from_table("reaction")
                    .cond_where(Expr::col("event_id").in_subquery(event_id))
                    .returning_all();
                let mut query = UpdateStatement::new();
                query
                    // This should be as easy as a subquery, but SeaQuery
                    // doesn't support it. So we have to use CTEs.
                    .with_cte({
                        let mut c = WithClause::new();
                        let mut cte = CommonTableExpression::new();
                        cte.table_name("deleted_reaction")
                            .query(delete_reaction);
                        c.recursive(false).cte(cte);
                        c
                    })
                    .table("reaction_tally")
                    .values([
                        (
                            "positive_count",
                            Expr::Column(
                                ("reaction_tally", "positive_count").into(),
                            )
                            .sub(
                                Expr::case(
                                    Expr::Column("positive".into()),
                                    Expr::Constant(1.into()),
                                )
                                .finally(Expr::Constant(0.into())),
                            ),
                        ),
                        (
                            "negative_count",
                            Expr::Column(
                                ("reaction_tally", "negative_count").into(),
                            )
                            .sub(
                                Expr::case(
                                    Expr::Column("positive".into()),
                                    Expr::Constant(0.into()),
                                )
                                .finally(Expr::Constant(1.into())),
                            ),
                        ),
                    ])
                    .from("deleted_reaction")
                    .and_where(
                        Expr::Column(("reaction_tally", "event_id").into()).eq(
                            Expr::Column(
                                ("deleted_reaction", "on_post").into(),
                            ),
                        ),
                    );
                db.execute(&query).await?;
                return Ok(());
            }
            // Nothing to delete.
            _ => return Ok(()),
        }

        query.cond_where(Expr::col("event_id").in_subquery(event_id));
        db.execute(&query).await?;
        Ok(())
    }
}

/// Returns a select statement to get the event id from `key`.
fn select_event_id(key: EventKeyParts) -> SelectStatement {
    let mut query = SelectStatement::new();
    query
        .column(EventModel::Column::Id)
        .from(EventModel::Entity)
        .and_where(EventModel::Column::Collection.eq(key.collection))
        .and_where(EventModel::Column::Identity.eq(key.identity))
        .and_where(EventModel::Column::PublicKeyType.eq(key.public_key_type))
        .and_where(EventModel::Column::PublicKey.eq(key.public_key))
        .and_where(EventModel::Column::Sequence.eq(key.sequence));
    query
}

fn select_not_deleted_event_id(key: EventKeyParts) -> SelectStatement {
    let mut query = select_event_id(key);
    // Make sure the post is not deleted.
    query.and_where(Expr::not_exists({
        let mut q = SelectStatement::new();
        q.expr(Expr::Constant(true.into()))
            .from(ContentDeleteModel::Entity)
            .and_where(
                Expr::col(
                    ContentDeleteModel::Column::EventKeyCollection
                        .as_column_ref(),
                )
                .eq(Expr::col(EventModel::Column::Collection.as_column_ref())),
            )
            .and_where(
                Expr::col(
                    ContentDeleteModel::Column::EventKeyIdentity
                        .as_column_ref(),
                )
                .eq(Expr::col(EventModel::Column::Identity.as_column_ref())),
            )
            .and_where(
                Expr::col(
                    ContentDeleteModel::Column::EventKeyPublicKeyType
                        .as_column_ref(),
                )
                .eq(Expr::col(
                    EventModel::Column::PublicKeyType.as_column_ref(),
                )),
            )
            .and_where(
                Expr::col(
                    ContentDeleteModel::Column::EventKeyPublicKey
                        .as_column_ref(),
                )
                .eq(Expr::col(EventModel::Column::PublicKey.as_column_ref())),
            )
            .and_where(
                Expr::col(
                    ContentDeleteModel::Column::EventKeySequence
                        .as_column_ref(),
                )
                .eq(Expr::col(EventModel::Column::Sequence.as_column_ref())),
            );
        q
    }));
    query
}
