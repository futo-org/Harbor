use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "notification")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = true)]
    pub id: i64,

    // protobuf: `polycentric.v2.NotificationKind` discriminant.
    pub kind: i32,

    // Derived from the triggering event
    pub from_identity: String,

    // Derived from the target event
    pub to_identity: String,

    // Event that triggered the notification
    pub trigger_event_key_collection: i16,
    pub trigger_event_key_identity: String,
    pub trigger_event_key_public_key_type: i16,
    pub trigger_event_key_public_key: Vec<u8>,
    pub trigger_event_key_sequence: i64,

    // Event that the notification is targetting
    pub target_event_key_collection: i16,
    pub target_event_key_identity: String,
    pub target_event_key_public_key_type: i16,
    pub target_event_key_public_key: Vec<u8>,
    pub target_event_key_sequence: i64,

    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

impl ActiveModelBehavior for ActiveModel {}
