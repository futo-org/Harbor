use super::split_event_key;
use crate::service::proto::CalendarEventRsvp;
use entity::content_calendar_event_rsvp;
use sea_orm::DbErr;
use sea_orm::sea_query::{DynIden, Expr, InsertStatement, SelectStatement};
use tonic::Status;

pub(super) fn add_query(
    rsvp: CalendarEventRsvp,
    content_id: (DynIden, DynIden),
) -> Result<InsertStatement, Status> {
    let CalendarEventRsvp { event_key, status } = rsvp;
    let key = split_event_key(event_key, "calendar event rsvp")?;
    let status = i16::try_from(status).map_err(|_| {
        Status::invalid_argument("calendar event rsvp status out of range")
    })?;

    let mut query = InsertStatement::new();
    query
        .into_table(content_calendar_event_rsvp::Entity)
        .columns([
            content_calendar_event_rsvp::Column::ContentId,
            content_calendar_event_rsvp::Column::Status,
            content_calendar_event_rsvp::Column::EventKeyCollection,
            content_calendar_event_rsvp::Column::EventKeyIdentity,
            content_calendar_event_rsvp::Column::EventKeyPublicKeyType,
            content_calendar_event_rsvp::Column::EventKeyPublicKey,
            content_calendar_event_rsvp::Column::EventKeySequence,
        ])
        .select_from({
            let mut q = SelectStatement::new();
            q.from(content_id.0.clone())
                .expr(Expr::col(content_id))
                .expr(Expr::from(status))
                .expr(Expr::from(key.collection))
                .expr(Expr::from(key.identity))
                .expr(Expr::from(key.public_key_type))
                .expr(Expr::from(key.public_key))
                .expr(Expr::from(key.sequence));
            q
        })
        .map_err(|err| {
            let err = DbErr::Custom(format!("incorrect amount of values: {err}"));
            tracing::error!(error = %err, "failed to create query to store calendar event rsvp content");
            Status::internal("internal server error")
        })?;

    Ok(query)
}
