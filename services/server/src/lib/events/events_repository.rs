use ::entity::event_model as EventModel;
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

        let mut query = EventModel::Entity::find()
            .order_by_asc(EventModel::Column::Id)
            .limit(limit.unwrap_or(200));

        query.all(db).await
    }
}
