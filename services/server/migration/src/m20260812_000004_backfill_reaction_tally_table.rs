use entity::{
    content_delete_model, content_model, content_post_model, event_model,
};
use polycentric_common::models::collections;
use sea_orm::{ColumnTrait, EntityTrait, RelationDef};

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        let mut posts = SelectStatement::new();
        posts
            .column(event_model::Column::Id.as_column_ref())
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
                content_post_model::Entity,
                Condition::any().add(
                    Expr::col(
                        content_post_model::Column::ContentId.as_column_ref(),
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
            .and_where(event_model::Column::Collection.eq(collections::FEED))
            .and_where(
                Expr::cust(content_delete_model::Entity.into_iden().inner())
                    .is_null(),
            );

        let mut posts = tx
            .query_all(&posts)
            .await?
            .into_iter()
            .map(|result| result.try_get_many_by_index::<i64>())
            .collect::<Result<Vec<_>, _>>()?;

        if posts.is_empty() {
            // Done quickly.
            return Ok(());
        }

        // Sort by event id to help Postgres primary key index creation.
        posts.sort();

        let tallies = InsertStatement::new()
            .into_table("reaction_tally")
            .columns(["event_id", "positive_count", "negative_count"])
            .values_from_panic(posts.into_iter().map(|event_id| {
                [Expr::from(event_id), Expr::from(0), Expr::from(0)]
            }))
            .on_conflict({
                let mut c = OnConflict::column("event_id");
                c.do_nothing();
                c
            })
            .take();

        tx.execute(&tallies).await?;
        Ok(())
    }

    async fn down(&self, _: &SchemaManager) -> Result<(), DbErr> {
        // Not undoing a data migration.
        Ok(())
    }
}
