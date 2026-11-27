//! Model for the `calendar_event_rsvp` table.

use sea_orm::entity::prelude::*;

/// Cache for calendar event RSVPs.
///
/// One row per identity and calendar event, for their current RSVP. Late
/// RSVPs and hosting RSVPs from identities the event doesn't name aren't
/// kept.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "calendar_event_rsvp")]
pub struct Model {
    /// Id of the event that contains the RSVP.
    #[sea_orm(primary_key, auto_increment = false)]
    pub event_id: i64,
    /// Same as `events.identity`.
    pub identity: String,
    /// Id of the event that contains the calendar event.
    pub on_event: i64,
    /// `CalendarEventRsvpStatus`
    pub status: i16,

    #[sea_orm(belongs_to, from = "event_id", to = "id")]
    pub event: HasOne<super::event::Entity>,
}

impl ActiveModelBehavior for ActiveModel {}
