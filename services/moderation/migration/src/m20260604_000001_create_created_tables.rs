use moderation_entity::{created_content_model, created_event_model};
use sea_orm::Schema;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let schema = Schema::new(manager.get_database_backend());

        if !manager.has_table("created_content").await? {
            manager
                .create_table(schema.create_table_from_entity(created_content_model::Entity))
                .await?;
        }

        if !manager.has_table("created_event").await? {
            manager
                .create_table(schema.create_table_from_entity(created_event_model::Entity))
                .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .if_exists()
                    .table(created_event_model::Entity)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .if_exists()
                    .table(created_content_model::Entity)
                    .to_owned(),
            )
            .await
    }
}
