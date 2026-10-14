use ::entity::notification_read_marker;
use sea_orm::Schema;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager.has_table("notification_read_marker").await? {
            return Ok(());
        }
        let schema = Schema::new(manager.get_database_backend());
        manager
            .create_table(
                schema
                    .create_table_from_entity(notification_read_marker::Entity),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .if_exists()
                    .table(notification_read_marker::Entity)
                    .to_owned(),
            )
            .await
    }
}
