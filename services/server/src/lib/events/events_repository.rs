use ::entity::event_model as EventModel;
// use ::entity::content_model as ContentModel;
use sea_orm::*;

pub struct Query;

impl Query {
    pub async fn list_events(
        db: &DbConn,
        // Limit the number of results
        mut limit: Option<u64>,
    ) -> Result<Vec<EventModel::Model>, DbErr> {
        if limit > Some(200) {
            limit = Some(200);
        }

        EventModel::Entity::find()
            .order_by_asc(EventModel::Column::Id)
            .limit(limit)
            .all(db)
            .await
    }
}

pub struct Mutation;

impl Mutation {
    pub async fn add_event(
        db: &DbConn,
        active_model: EventModel::ActiveModel,
    ) -> Result<EventModel::Model, DbErr> {
        active_model.insert(db).await
    }
}
