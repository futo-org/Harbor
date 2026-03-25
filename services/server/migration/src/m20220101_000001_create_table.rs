use ::entity::{event_model, follow_model, post_model, reaction_model};
use sea_orm::Schema;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let schema = Schema::new(manager.get_database_backend());

        manager
            .create_table(schema.create_table_from_entity(event_model::Entity))
            .await?;
        manager
            .create_table(schema.create_table_from_entity(post_model::Entity))
            .await?;
        manager
            .create_table(schema.create_table_from_entity(follow_model::Entity))
            .await?;
        manager
            .create_table(
                schema.create_table_from_entity(reaction_model::Entity),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(reaction_model::Entity).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(follow_model::Entity).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(post_model::Entity).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(event_model::Entity).to_owned())
            .await?;

        Ok(())
    }
}
