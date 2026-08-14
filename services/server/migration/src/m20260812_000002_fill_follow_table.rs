use entity::{
    content_delete_model, content_follow_model, content_model, event_model,
    follow_model,
};
use polycentric_common::models::collections;
use sea_orm::RelationDef;
use sea_orm::sea_query::InsertStatement;
use sea_orm::{ColumnTrait, EntityTrait};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        let mut followers = SelectStatement::new();
        followers
            .column(event_model::Column::Id.as_column_ref())
            .column(event_model::Column::Identity.as_column_ref())
            .column(content_follow_model::Column::IdentityId.as_column_ref())
            .from(event_model::Entity)
            .inner_join(
                content_model::Entity,
                Into::<RelationDef>::into(
                    event_model::Entity::belongs_to(content_model::Entity)
                        .from(event_model::Column::ContentDigestType)
                        .to(content_model::Column::DigestType)
                        .on_condition(|event_tbl, content_tbl| {
                            Expr::col((
                                event_tbl,
                                event_model::Column::ContentDigestBytes,
                            ))
                            .equals((
                                content_tbl,
                                content_model::Column::DigestBytes,
                            ))
                            .into_condition()
                        }),
                ),
            )
            .inner_join(
                content_follow_model::Entity,
                Condition::any().add(
                    Expr::col(
                        content_follow_model::Column::ContentId.as_column_ref(),
                    )
                    .eq(Expr::col(content_model::Column::Id.as_column_ref())),
                ),
            )
            .left_join(
                content_delete_model::Entity,
                Condition::all()
                    .add(
                        Expr::col(
                            content_delete_model::Column::EventKeyCollection
                                .as_column_ref(),
                        )
                        .eq(Expr::col(
                            event_model::Column::Collection.as_column_ref(),
                        )),
                    )
                    .add(
                        Expr::col(
                            content_delete_model::Column::EventKeyIdentity
                                .as_column_ref(),
                        )
                        .eq(Expr::col(
                            event_model::Column::Identity.as_column_ref(),
                        )),
                    )
                    .add(
                        Expr::col(
                            content_delete_model::Column::EventKeyPublicKeyType
                                .as_column_ref(),
                        )
                        .eq(Expr::col(
                            event_model::Column::PublicKeyType.as_column_ref(),
                        )),
                    )
                    .add(
                        Expr::col(
                            content_delete_model::Column::EventKeyPublicKey
                                .as_column_ref(),
                        )
                        .eq(Expr::col(
                            event_model::Column::PublicKey.as_column_ref(),
                        )),
                    )
                    .add(
                        Expr::col(
                            content_delete_model::Column::EventKeySequence
                                .as_column_ref(),
                        )
                        .eq(Expr::col(
                            event_model::Column::Sequence.as_column_ref(),
                        )),
                    ),
            )
            .and_where(
                event_model::Column::Collection.eq(collections::SOCIAL_GRAPH),
            )
            .and_where(
                Expr::cust(content_delete_model::Entity.into_iden().inner())
                    .is_null(),
            );

        let mut followers = tx
            .query_all(&followers)
            .await?
            .into_iter()
            .map(|result| {
                result.try_get_many_by_index::<(i64, String, String)>()
            })
            .collect::<Result<Vec<_>, _>>()?;

        if followers.is_empty() {
            // Done quickly.
            return Ok(());
        }

        // Sort by event id to help Postgres primary key index creation.
        followers.sort_by_key(|m| m.0);

        let follow_rows = InsertStatement::new()
            .into_table(follow_model::Entity)
            .columns([
                follow_model::Column::EventId,
                follow_model::Column::Follower,
                follow_model::Column::Followee,
            ])
            .values_from_panic(followers.into_iter().map(
                |(event_id, follower, followee)| {
                    [
                        Expr::from(event_id),
                        Expr::from(follower),
                        Expr::from(followee),
                    ]
                },
            ))
            .on_conflict({
                let mut c = OnConflict::column(follow_model::Column::EventId);
                c.do_nothing();
                c
            })
            .take();

        tx.execute(&follow_rows).await?;
        Ok(())
    }

    async fn down(&self, _: &SchemaManager) -> Result<(), DbErr> {
        // Not undoing a data migration.
        Ok(())
    }
}
