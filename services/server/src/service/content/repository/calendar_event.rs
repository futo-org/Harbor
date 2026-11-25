use entity::{content_calendar_event, content_calendar_event_host};
use sea_orm::DbErr;
use sea_orm::sea_query::{
    CommonTableExpression, DynIden, Expr, InsertStatement, SelectStatement,
    WithClause,
};
use tonic::Status;

use crate::service::content::repository::Mutation;
use crate::service::proto::{CalendarEvent, CalendarEventLocation, GeoPoint};
use crate::util::db::timestamp_from_millis;

pub(super) fn add_query(
    with: &mut WithClause,
    event: CalendarEvent,
    content_id: (DynIden, DynIden),
) -> Result<InsertStatement, Status> {
    let CalendarEvent {
        id: _,
        title,
        description,
        start_at,
        end_at,
        location,
        labels,
        all_day,
        image,
        timezone,
        mut hosts,
    } = event;
    // Validation limits these, so this only fails for unvalidated content
    let out_of_range =
        || Status::invalid_argument("calendar event time out of range");
    let start_at = timestamp_from_millis(start_at).ok_or_else(out_of_range)?;
    let end_at = end_at
        .map(|at| timestamp_from_millis(at).ok_or_else(out_of_range))
        .transpose()?;
    let CalendarEventLocation {
        name,
        address,
        point,
        url,
    } = location.unwrap_or_default();
    let (latitude, longitude) = match point {
        Some(GeoPoint {
            latitude,
            longitude,
        }) => (Some(latitude), Some(longitude)),
        None => (None, None),
    };

    let mut query = InsertStatement::new();
    query
        .into_table(content_calendar_event::Entity)
        .columns([
            content_calendar_event::Column::ContentId,
            content_calendar_event::Column::Title,
            content_calendar_event::Column::Description,
            content_calendar_event::Column::StartAt,
            content_calendar_event::Column::EndAt,
            content_calendar_event::Column::AllDay,
            content_calendar_event::Column::Timezone,
            content_calendar_event::Column::Labels,
            content_calendar_event::Column::LocationName,
            content_calendar_event::Column::LocationAddress,
            content_calendar_event::Column::LocationUrl,
            content_calendar_event::Column::Latitude,
            content_calendar_event::Column::Longitude,
        ])
        .select_from({
            let mut q = SelectStatement::new();
            q.from(content_id.0.clone())
                .expr(Expr::col(content_id.clone()))
                .expr(Expr::from(title))
                .expr(Expr::from(description))
                .expr(Expr::from(start_at))
                .expr(Expr::from(end_at))
                .expr(Expr::from(all_day))
                .expr(Expr::from(timezone))
                .expr(Expr::from(labels))
                // Empty name means the location only has an address or link
                .expr(Expr::from(Some(name).filter(|name| !name.is_empty())))
                .expr(Expr::from(address))
                .expr(Expr::from(url))
                .expr(Expr::from(latitude))
                .expr(Expr::from(longitude));
            q
        })
        .map_err(|err| {
            let err = DbErr::Custom(format!("incorrect amount of values: {err}"));
            tracing::error!(error = %err, "failed to create query to store calendar event content");
            Status::internal("internal server error")
        })?;

    hosts.sort();
    hosts.dedup();
    if !hosts.is_empty() {
        let mut insert_hosts = InsertStatement::new();
        insert_hosts
            .into_table(content_calendar_event_host::Entity)
            .columns([
                content_calendar_event_host::Column::ContentId,
                content_calendar_event_host::Column::Identity,
            ])
            .select_from({
                let mut q = SelectStatement::new();
                q.from(content_id.0.clone())
                    .expr(Expr::col(content_id.clone()))
                    .expr(Expr::cust_with_expr("UNNEST($1)", hosts));
                q
            })
            .map_err(|err| {
                let err = DbErr::Custom(format!("incorrect amount of values: {err}"));
                tracing::error!(error = %err, "failed to create query to store calendar event hosts");
                Status::internal("internal server error")
            })?;
        let mut cte = CommonTableExpression::new();
        cte.table_name("calendar_event_hosts").query(insert_hosts);
        with.cte(cte);
    }

    // Stops the cover photo blobs being pruned
    let result = Mutation::store_image_sets(image.into_iter().collect(), content_id)
        .map_err(|error| {
            tracing::error!(%error, "failed to create query to store calendar event image");
            Status::internal("internal server error")
        })?;
    if let Some(query) = result {
        let mut cte = CommonTableExpression::new();
        cte.table_name("calendar_event_images").query(query);
        with.cte(cte);
    }

    Ok(query)
}
