use sea_orm::entity::prelude::*;

/// Computed table of which user is following which other users.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "follow")]
pub struct Model {
    /// Primary key.
    ///
    /// Also a foreign key to the event (`events` table).
    #[sea_orm(primary_key, auto_increment = false)]
    pub event_id: i64,
    /// Key of the identity (sha256 hash of the initial Identity content) that
    /// is doing the following.
    pub follower: String,
    /// Key of the identity that is being followed.
    pub followee: String,

    #[sea_orm(belongs_to, from = "event_id", to = "id")]
    pub parent: HasOne<super::event_model::Entity>,
}

impl ActiveModelBehavior for ActiveModel {}
