use grayjay_migrator_entity::migrated_event_model;
use sea_orm::Schema;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager.has_table("migrated_event").await? {
            return Ok(());
        }

        let schema = Schema::new(manager.get_database_backend());
        manager
            .create_table(schema.create_table_from_entity(migrated_event_model::Entity))
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .if_exists()
                    .table(migrated_event_model::Entity)
                    .to_owned(),
            )
            .await
    }
}
