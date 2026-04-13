use ::entity::{
    content_blob_model, content_block_model, content_delete_model,
    content_follow_model, content_identity_model, content_image_model,
    content_model, content_post_model, content_profile_update_model,
    content_reaction_model, event_model,
};
use sea_orm::{EntityTrait, Schema};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Helper to create a table and its indexes from a SeaORM entity.
async fn create_entity<E: EntityTrait>(
    manager: &SchemaManager<'_>,
    schema: &Schema,
    entity: E,
) -> Result<(), DbErr> {
    manager
        .create_table(schema.create_table_from_entity(entity))
        .await?;

    for index in schema.create_index_from_entity(entity) {
        manager.create_index(index).await?;
    }

    Ok(())
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let schema = Schema::new(manager.get_database_backend());

        // Content must be created first (events and content children reference it)
        create_entity(manager, &schema, content_model::Entity).await?;
        create_entity(manager, &schema, event_model::Entity).await?;
        create_entity(manager, &schema, content_post_model::Entity).await?;
        create_entity(manager, &schema, content_delete_model::Entity).await?;
        create_entity(manager, &schema, content_follow_model::Entity).await?;
        create_entity(manager, &schema, content_block_model::Entity).await?;
        create_entity(manager, &schema, content_reaction_model::Entity)
            .await?;
        create_entity(
            manager,
            &schema,
            content_profile_update_model::Entity,
        )
        .await?;
        create_entity(manager, &schema, content_image_model::Entity).await?;
        create_entity(manager, &schema, content_blob_model::Entity).await?;
        create_entity(manager, &schema, content_identity_model::Entity)
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(content_identity_model::Entity)
                    .to_owned(),
            )
            .await?;
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
