use entity::{
    content_delete_model, content_model, content_repost_model, event_model,
    repost_model,
};
use sea_orm::{ColumnTrait, EntityTrait, RelationDef};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager.has_table(repost_model::Entity.unquoted()).await? {
            return Ok(());
        }

        let tx = manager.get_connection();

        let mut create_table = TableCreateStatement::new();
        create_table
            .table(repost_model::Entity.unquoted())
            .col({
                let mut def = ColumnDef::new(repost_model::Column::EventId);
                def.primary_key().big_integer().not_null();
                def
            })
            .col({
                let mut def = ColumnDef::new(repost_model::Column::Identity);
                def.text().not_null();
                def
            })
            .col({
                let mut def = ColumnDef::new(repost_model::Column::Post);
                def.big_integer().not_null();
                def
            });

        tx.execute(&create_table).await?;

        let mut fill_table = InsertStatement::new();
        fill_table
            .into_table(repost_model::Entity)
            .columns([
                repost_model::Column::EventId,
                repost_model::Column::Identity,
                repost_model::Column::Post,
            ])
            .select_from({
                let mut q = SelectStatement::new();
                q
                    .clear_selects() // Need to rename.
                    .expr(SelectExpr {
                        expr: Expr::col(event_model::Column::Id.as_column_ref()),
                        alias: Some(repost_model::Column::EventId.into()),
                        window: None,
                    })
                    .expr(SelectExpr {
                        expr: Expr::col(event_model::Column::Identity.as_column_ref()),
                        alias: Some(repost_model::Column::Identity.into()),
                        window: None,
                    })
                    .expr(SelectExpr {
                        expr: Expr::col((
                              "repost_event", event_model::Column::Id.unquoted(),
                        )),
                        alias: Some(repost_model::Column::Post.into()),
                        window: None,
                    })
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
                        content_repost_model::Entity,
                        Condition::any().add(
                            Expr::col(
                                content_repost_model::Column::ContentId.as_column_ref(),
                            )
                            .eq(Expr::col(content_model::Column::Id.as_column_ref())),
                        ),
                    )
                    .inner_join(
                        TableRef::Table(event_model::Entity.into(), Some("repost_event".into())),
                        Condition::all()
                            .and(Expr::col(content_repost_model::Column::EventKeyCollection.as_column_ref())
                                .eq(Expr::col(("repost_event", event_model::Column::Collection))))
                            .and(Expr::col(content_repost_model::Column::EventKeyIdentity.as_column_ref())
                                .eq(Expr::col(("repost_event", event_model::Column::Identity))))
                            .and(Expr::col(content_repost_model::Column::EventKeyPublicKeyType.as_column_ref())
                                .eq(Expr::col(("repost_event", event_model::Column::PublicKeyType))))
                            .and(Expr::col(content_repost_model::Column::EventKeyPublicKey.as_column_ref())
                                .eq(Expr::col(("repost_event", event_model::Column::PublicKey))))
                            .and(Expr::col(content_repost_model::Column::EventKeySequence.as_column_ref())
                                .eq(Expr::col(("repost_event", event_model::Column::Sequence))))
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
                        Expr::cust(content_delete_model::Entity.into_iden().inner())
                            .is_null(),
                    );
                q
            })
            .map_err(|err| {
                DbErr::Custom(format!("incorrect amount of values: {err}"))
            })?
            .on_conflict({
                let mut c = OnConflict::column(repost_model::Column::EventId);
                c.do_nothing();
                c
            });

        tx.execute(&fill_table).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_table(repost_model::Entity.unquoted()).await? {
            return Ok(());
        }

        let mut drop_table = TableDropStatement::new();
        drop_table.table(repost_model::Entity.unquoted()).restrict();
        manager.drop_table(drop_table).await?;
        Ok(())
    }
}
