use entity::content_profile_update;
use sea_orm::DbErr;
use sea_orm::prelude::Json;
use sea_orm::sea_query::{
    CommonTableExpression, DynIden, Expr, InsertStatement, SelectStatement,
    WithClause,
};
use tonic::Status;

use crate::service::content::repository::Mutation;
use crate::service::proto::ImageSet;
use crate::service::proto::ProfileUpdate;

pub(super) fn add_query(
    with: &mut WithClause,
    update: ProfileUpdate,
    content_id: (DynIden, DynIden),
) -> Result<InsertStatement, Status> {
    let ProfileUpdate {
        name,
        avatar,
        banner,
        description,
        alias,
    } = update;

    let mut query = InsertStatement::new();
    query
        .into_table(content_profile_update::Entity)
        .columns([
            content_profile_update::Column::ContentId,
            content_profile_update::Column::Name,
            content_profile_update::Column::Avatar,
            content_profile_update::Column::Banner,
            content_profile_update::Column::Description,
            content_profile_update::Column::Alias,
        ])
        .select_from({
            let mut q = SelectStatement::new();
            q.from(content_id.0.clone())
                .expr(Expr::col(content_id.clone()))
                .expr(Expr::from(name))
                .expr(Expr::from(to_json(avatar.as_ref())?))
                .expr(Expr::from(to_json(banner.as_ref())?))
                .expr(Expr::from(description))
                .expr(Expr::from(alias));
           q
        })
        .map_err(|err| {
            let err = DbErr::Custom(format!("incorrect amount of values: {err}"));
            tracing::error!(error = %err, "failed to create query to store profile update content");
            Status::internal("internal server error")
        })?;

    if let Some(avatar) = avatar
    && let Some(query) =
        Mutation::store_image_sets(vec![avatar], content_id.clone())
        .map_err(|err| {
            tracing::error!(error = %err, "failed to create query to store profile update avatar");
            Status::internal("internal server error")
        })?
    {
            let mut cte = CommonTableExpression::new();
            cte.table_name("profile_update_avatar").query(query);
            with.cte(cte);
    }

    if let Some(banner) = banner
    && let Some(query) =
        Mutation::store_image_sets(vec![banner], content_id.clone())
        .map_err(|err| {
            tracing::error!(error = %err, "failed to create query to store profile update banner");
            Status::internal("internal server error")
        })?
    {
            let mut cte = CommonTableExpression::new();
            cte.table_name("profile_update_banner").query(query);
            with.cte(cte);
    }

    Ok(query)
}

fn to_json(set: Option<&ImageSet>) -> Result<Option<Json>, Status> {
    match set {
        Some(set) => match serde_json::to_value(set) {
            Ok(value) => Ok(Some(value)),
            Err(err) => {
                tracing::warn!(
                    "failed to serialise image set for profile update: {err}"
                );
                Err(Status::internal("internal server error"))
            }
        },
        None => Ok(None),
    }
}
