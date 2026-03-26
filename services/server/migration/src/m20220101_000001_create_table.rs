use ::entity::{
    blob_model, block_model, content_model, delete_model, event_model, follow_model, image_model,
    post_model, profile_update_model, reaction_model,
};
use sea_orm::Schema;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let schema = Schema::new(manager.get_database_backend());

        // Content must be created first (events and content children reference it)
        manager
            .create_table(schema.create_table_from_entity(content_model::Entity))
            .await?;
        manager
            .create_table(schema.create_table_from_entity(event_model::Entity))
            .await?;
        manager
            .create_table(schema.create_table_from_entity(post_model::Entity))
            .await?;
        manager
            .create_table(schema.create_table_from_entity(delete_model::Entity))
            .await?;
        manager
            .create_table(schema.create_table_from_entity(follow_model::Entity))
            .await?;
        manager
            .create_table(schema.create_table_from_entity(block_model::Entity))
            .await?;
        manager
            .create_table(schema.create_table_from_entity(reaction_model::Entity))
            .await?;
        manager
            .create_table(schema.create_table_from_entity(profile_update_model::Entity))
            .await?;
        manager
            .create_table(schema.create_table_from_entity(image_model::Entity))
            .await?;
        manager
            .create_table(schema.create_table_from_entity(blob_model::Entity))
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(blob_model::Entity).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(image_model::Entity).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(profile_update_model::Entity).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(reaction_model::Entity).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(block_model::Entity).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(follow_model::Entity).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(delete_model::Entity).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(post_model::Entity).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(event_model::Entity).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(content_model::Entity).to_owned())
            .await?;

        Ok(())
    }
}
