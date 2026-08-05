use super::{ChildContext, map_db_err};
use crate::service::proto::ImageSet;
use crate::service::proto::ProfileUpdate;
use ::entity::content_profile_update_model as ContentProfileUpdateModel;
use sea_orm::prelude::Json;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait};
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    update: ProfileUpdate,
) -> Result<(), Status> {
    ContentProfileUpdateModel::ActiveModel {
        content_id: Set(ctx.content_id),
        name: Set(update.name),
        avatar: Set(to_json(update.avatar)?),
        banner: Set(to_json(update.banner)?),
        description: Set(update.description),
        alias: Set(update.alias),
    }
    .insert(db)
    .await
    .map_err(map_db_err)?;

    Ok(())
}

fn to_json(set: Option<ImageSet>) -> Result<Option<Json>, Status> {
    match set {
        Some(set) => match serde_json::to_value(set) {
            Ok(value) => Ok(Some(value)),
            Err(err) => {
                log::warn!(
                    "failed to serialise image set for profile update: {err}"
                );
                Err(Status::internal("internal server error"))
            }
        },
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::proto::{Blob, Image, ImageSet};
    use sea_orm::{DatabaseBackend, MockDatabase};

    #[tokio::test]
    async fn profile_update() {
        // NOTE: not used.
        let returned = ContentProfileUpdateModel::Model {
            content_id: 1,
            name: Some("Alice".into()),
            avatar: Some(Json::Null), // NOTE: incorrect.
            banner: Some(Json::Null),
            description: Some("Description".into()),
            alias: Some("Alias".into()),
        };
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([[returned]])
            .into_connection();

        let update = ProfileUpdate {
            name: Some("Alice".into()),
            avatar: Some(ImageSet {
                images: vec![Image {
                    blob: Some(Blob {
                        digest: None,
                        mime_type: "Mime".into(),
                        size: 200,
                    }),
                    width: 10,
                    height: 20,
                }],
            }),
            banner: None,
            description: Some("Description".into()),
            alias: Some("Alias".into()),
        };
        add(
            &db,
            &ChildContext {
                content_id: 1,
                event_identity: "alice",
            },
            update,
        )
        .await
        .unwrap();

        let sql = format!("{:?}", db.into_transaction_log());
        assert!(sql.contains("content_profile_update"), "{sql}");
    }
}
