use ::entity::content_reaction_model;
use sea_orm_migration::prelude::*;

/// Replaces `content_reaction.opinion` (the legacy 0/1/2/3 enum-in-an-int)
/// with `positive: bool`, matching the v2 `Reaction.positive` proto field.
/// Existing data is dropped — no backfill.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(content_reaction_model::Entity)
                    .drop_column(Alias::new("opinion"))
                    .add_column(
                        ColumnDef::new(
                            content_reaction_model::Column::Positive,
                        )
                        .boolean()
                        .not_null(),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(content_reaction_model::Entity)
                    .drop_column(content_reaction_model::Column::Positive)
                    .add_column(
                        ColumnDef::new(Alias::new("opinion"))
                            .small_integer()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await
    }
}
