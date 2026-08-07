use ::entity::{
    content_blob_model, content_block_model, content_delete_model,
    content_follow_model, content_identity_model, content_image_model,
    content_label_model, content_model, content_post_model,
    content_profile_update_model, content_reaction_model, content_report_model,
    content_repost_model, content_verification_claim_model,
    content_verification_target_model, content_verification_verify_model,
};
use polycentric_common::models::protos_v2::content::ContentBody;
use polycentric_common::models::protos_v2::{Content, ImageSet};
use prost::Message;
use sea_orm::prelude::Json;
use sea_orm::{ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();

        let content = content_model::Entity::find()
            .filter(
                content_model::Column::Id.not_in_subquery(
                    Query::select()
                        .column(content_blob_model::Column::ContentId)
                        .from(content_blob_model::Entity)
                        .union(UnionType::All, Query::select().column(content_block_model::Column::ContentId).from(content_block_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_delete_model::Column::ContentId).from(content_delete_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_follow_model::Column::ContentId).from(content_follow_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_identity_model::Column::ContentId).from(content_identity_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_image_model::Column::ContentId).from(content_image_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_label_model::Column::ContentId).from(content_label_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_post_model::Column::ContentId).from(content_post_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_profile_update_model::Column::ContentId).from(content_profile_update_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_reaction_model::Column::ContentId).from(content_reaction_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_report_model::Column::ContentId).from(content_report_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_repost_model::Column::ContentId).from(content_repost_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_verification_claim_model::Column::ContentId).from(content_verification_claim_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_verification_target_model::Column::ContentId).from(content_verification_target_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_verification_verify_model::Column::ContentId).from(content_verification_verify_model::Entity).to_owned())
                        .union(UnionType::All, Query::select().column(content_block_model::Column::ContentId).from(content_block_model::Entity).to_owned())
                        .to_owned()
                )
            )
            .all(conn)
            .await?;

        let profile_updates = content.into_iter().filter_map(|row| {
            let content = Content::decode(&*row.serialized_bytes)
                .unwrap_or_else(|err| {
                    panic!("failed to decode content: {err}")
                });
            if let Some(ContentBody::ProfileUpdate(update)) =
                content.content_body
            {
                Some(content_profile_update_model::ActiveModel {
                    content_id: Set(row.id),
                    name: Set(update.name),
                    avatar: Set(to_json(update.avatar)),
                    banner: Set(to_json(update.banner)),
                    description: Set(update.description),
                    alias: Set(update.alias),
                })
            } else {
                None
            }
        });

        content_profile_update_model::Entity::insert_many(profile_updates)
            .exec(conn)
            .await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        // We're only migrating data, which we don't want to undo.
        Ok(())
    }
}

// Similar to the function in `src/service/content/repository/profile_update.rs`.
fn to_json(set: Option<ImageSet>) -> Option<Json> {
    match set {
        Some(set) => match serde_json::to_value(set) {
            Ok(value) => Some(value),
            Err(err) => panic!("unexpected error: {err}"),
        },
        None => None,
    }
}
