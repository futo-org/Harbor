use ::entity::{
    content_blob_model, content_block_model, content_delete_model,
    content_follow_model, content_image_model, content_model,
    content_post_model, content_profile_update_model, content_reaction_model,
    event_model,
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
            .create_table(
                schema.create_table_from_entity(content_model::Entity),
            )
            .await?;
        manager
            .create_table(schema.create_table_from_entity(event_model::Entity))
            .await?;
        manager
            .create_table(
                schema.create_table_from_entity(content_post_model::Entity),
            )
            .await?;
        manager
            .create_table(
                schema.create_table_from_entity(content_delete_model::Entity),
            )
            .await?;
        manager
            .create_table(
                schema.create_table_from_entity(content_follow_model::Entity),
            )
            .await?;
        manager
            .create_table(
                schema.create_table_from_entity(content_block_model::Entity),
            )
            .await?;
        manager
            .create_table(
                schema.create_table_from_entity(content_reaction_model::Entity),
            )
            .await?;
        manager
            .create_table(
                schema.create_table_from_entity(
                    content_profile_update_model::Entity,
                ),
            )
            .await?;
        manager
            .create_table(
                schema.create_table_from_entity(content_image_model::Entity),
            )
            .await?;
        manager
            .create_table(
                schema.create_table_from_entity(content_blob_model::Entity),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop().table(content_blob_model::Entity).to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop().table(content_image_model::Entity).to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(content_profile_update_model::Entity)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(content_reaction_model::Entity)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop().table(content_block_model::Entity).to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop().table(content_follow_model::Entity).to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop().table(content_delete_model::Entity).to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop().table(content_post_model::Entity).to_owned(),
            )
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
