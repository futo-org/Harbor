use ::entity::event_model;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(event_model::Entity)
                    .modify_column(
                        ColumnDef::new(event_model::Column::Sequence)
                            .big_integer()
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
                    .table(event_model::Entity)
                    .modify_column(
                        ColumnDef::new(event_model::Column::Sequence)
                            .small_integer()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await
    }
}
