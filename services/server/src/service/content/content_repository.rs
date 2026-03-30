use ::entity::content_model as ContentModel;
use sea_orm::*;

pub struct Mutation;

impl Mutation {
    pub async fn add_content<C: ConnectionTrait>(
        db: &C,
        active_model: ContentModel::ActiveModel,
    ) -> Result<ContentModel::Model, DbErr> {
        active_model.insert(db).await
    }
}
