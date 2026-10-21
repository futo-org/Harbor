use ::entity::{content, content_label};
use polycentric_common::models::protos_v2::Content;
use polycentric_common::models::protos_v2::content::ContentBody;
use prost::Message;
use sea_orm::{ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};
use sea_orm_migration::prelude::*;

/// `content_label.label_value` used to be stored as the empty record `()`
/// instead of the label, because the VALUES CTE that fed the insert
/// selected no column. Rebuilds those rows from the stored `Labels`
/// content.
#[derive(DeriveMigrationName)]
pub struct Migration;

const BROKEN_VALUE: &str = "()";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();

        let broken = content_label::Entity::find()
            .filter(content_label::Column::LabelValue.eq(BROKEN_VALUE))
            .all(conn)
            .await?;
        if broken.is_empty() {
            return Ok(());
        }

        let contents = content::Entity::find()
            .filter(
                content::Column::Id
                    .is_in(broken.iter().map(|row| row.content_id)),
            )
            .all(conn)
            .await?;

        let mut rows = Vec::new();
        for row in contents {
            let Some(key) = broken.iter().find(|b| b.content_id == row.id)
            else {
                continue;
            };
            let Ok(Content {
                content_body: Some(ContentBody::Labels(labels)),
            }) = Content::decode(&*row.serialized_bytes)
            else {
                continue;
            };
            let mut values = labels.label_values;
            values.sort_unstable();
            values.dedup();
            // An empty set is indexed as a single '' row.
            if values.is_empty() {
                values.push(String::new());
            }
            for value in values {
                rows.push(content_label::ActiveModel {
                    content_id: Set(row.id),
                    label_value: Set(value),
                    event_key_collection: Set(key.event_key_collection),
                    event_key_identity: Set(key.event_key_identity.clone()),
                    event_key_public_key_type: Set(
                        key.event_key_public_key_type
                    ),
                    event_key_public_key: Set(key.event_key_public_key.clone()),
                    event_key_sequence: Set(key.event_key_sequence),
                });
            }
        }

        content_label::Entity::delete_many()
            .filter(content_label::Column::LabelValue.eq(BROKEN_VALUE))
            .exec(conn)
            .await?;
        if !rows.is_empty() {
            content_label::Entity::insert_many(rows).exec(conn).await?;
        }
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        // We're only migrating data, which we don't want to undo.
        Ok(())
    }
}
