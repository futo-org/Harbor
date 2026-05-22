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
                    .add_column(
                        ColumnDef::new(event_model::Column::PreviousRoot)
                            .binary()
                            .not_null()
                            .default(Vec::<u8>::new()),
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
                    .drop_column(event_model::Column::PreviousRoot)
                    .to_owned(),
            )
            .await
    }
}