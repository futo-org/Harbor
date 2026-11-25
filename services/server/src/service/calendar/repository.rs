use std::collections::HashMap;

use ::entity::{
    calendar_event_rsvp, content, content_calendar_event,
    content_calendar_event_host, event,
};
use polycentric_common::models::collections;
use sea_orm::prelude::DateTimeWithTimeZone;
use sea_orm::sea_query::extension::postgres::PgBinOper;
use sea_orm::sea_query::{
    Alias, Expr, ExprTrait, Func, Order, SelectStatement, Value,
};
use sea_orm::{
    ColumnTrait, Condition, EntityTrait, FromQueryResult, Iterable, JoinType,
    QueryFilter, QueryOrder, QueryResult, QuerySelect, RelationTrait, Select,
    TryGetError, TryGetable, TryGetableMany,
};
use tonic::Status;

use crate::data::{Cursor, CursorFilter, EventId, EventWithContentRow};
use crate::db::Connection;
use crate::service::events::TargetEventKey;
use crate::service::feeds::repository::{
    EventCreatedAt, content_join, deletes_by_author,
};
use crate::service::proto::{CalendarEventRsvpStatus, CalendarEventStats};
use crate::util::db::{CONTENT_PREFIX, EVENT_PREFIX, select_model_columns};

const CALENDAR_COLLECTION: i16 = collections::CALENDAR as i16;
const HOSTING: i16 = CalendarEventRsvpStatus::Hosting as i16;

/// Sort key when listing
pub type StartAt = DateTimeWithTimeZone;
/// Sort key when searching
pub type SearchRank = f32;

const SORTED_BY_COLUMN: &str = "sorted_by";

/// Filters for listing calendar events
#[derive(Debug, Default)]
pub struct EventsFilter<'a> {
    /// Only events this identity created or is hosting
    pub created_or_hosted_by: Option<&'a str>,
    /// Only events this identity has been asked to host and hasn't answered
    pub awaiting_host: Option<&'a str>,
    /// Only events that finish at or after this time
    pub ends_after: Option<DateTimeWithTimeZone>,
    /// Only events that finish before this time
    pub ends_before: Option<DateTimeWithTimeZone>,
}

// This type only exists to work around trying to get an additional column
// (what the rows are sorted by) from SeaORM.
#[derive(Debug)]
pub struct CalendarEventRow<SortedBy> {
    pub event: event::Model,
    pub content: content::Model,
    pub sorted_by: SortedBy,
}

impl<SortedBy: TryGetable> TryGetableMany for CalendarEventRow<SortedBy> {
    fn try_get_many(
        res: &QueryResult,
        _: &str,
        _: &[String],
    ) -> Result<Self, TryGetError> {
        Self::try_get_many_by_index(res)
    }

    fn try_get_many_by_index(res: &QueryResult) -> Result<Self, TryGetError> {
        Ok(CalendarEventRow {
            event: FromQueryResult::from_query_result(res, EVENT_PREFIX)?,
            content: FromQueryResult::from_query_result(res, CONTENT_PREFIX)?,
            sorted_by: res.try_get_by(SORTED_BY_COLUMN)?,
        })
    }
}

pub struct Query;

impl Query {
    /// List calendar events by start
    #[tracing::instrument(skip_all)]
    pub async fn list_events<C: Connection>(
        db: &mut C,
        filter: &EventsFilter<'_>,
        latest_first: bool,
        limit: u64,
        cursor_filter: &CursorFilter<StartAt>,
    ) -> Result<Vec<CalendarEventRow<StartAt>>, Status> {
        let mut query = select_calendar_events();
        if let Some(at) = filter.ends_after {
            query = query.filter(ends_at().gte(at));
        }
        if let Some(at) = filter.ends_before {
            query = query.filter(ends_at().lt(at));
        }
        if let Some(identity) = filter.created_or_hosted_by {
            let mut hosting = rsvp_by(identity);
            hosting.and_where(calendar_event_rsvp::Column::Status.eq(HOSTING));
            query = query.filter(
                Condition::any()
                    .add(event::Column::Identity.eq(identity))
                    .add(Expr::exists(hosting)),
            );
        }
        if let Some(identity) = filter.awaiting_host {
            let mut named_host = SelectStatement::new();
            named_host
                .expr(Expr::Constant(1.into()))
                .from(content_calendar_event_host::Entity)
                .and_where(
                    Expr::col(
                        content_calendar_event_host::Column::ContentId
                            .as_column_ref(),
                    )
                    .equals(content::Column::Id.as_column_ref()),
                )
                .and_where(
                    content_calendar_event_host::Column::Identity.eq(identity),
                );
            query = query
                // The creator isn't asked to host their own event
                .filter(event::Column::Identity.ne(identity))
                .filter(Expr::exists(named_host))
                .filter(Expr::exists(rsvp_by(identity)).not());
        }

        let start_at =
            Expr::col(content_calendar_event::Column::StartAt.as_column_ref());
        page(db, query, start_at, latest_first, limit, cursor_filter).await
    }

    /// Search calendar events, most relevant first
    #[tracing::instrument(skip_all)]
    pub async fn search_events<C: Connection>(
        db: &mut C,
        search_query: &str,
        limit: u64,
        cursor_filter: &CursorFilter<SearchRank>,
    ) -> Result<Vec<CalendarEventRow<SearchRank>>, Status> {
        // Generated column, so it isn't in the model
        let search_data = Expr::col((
            content_calendar_event::Entity,
            Alias::new("search_data"),
        ));
        let tsquery =
            Expr::from(Func::cust("create_tsquery").arg(search_query));
        // Normalised by document length (16) as post search does
        let rank = Expr::from(Func::cust("ts_rank").args([
            search_data.clone(),
            tsquery.clone(),
            Expr::value(16),
        ]));

        let query = select_calendar_events()
            .filter(search_data.binary(PgBinOper::Matches, tsquery));
        page(db, query, rank, true, limit, cursor_filter).await
    }

    /// Find a calendar event by key
    #[tracing::instrument(skip_all)]
    pub async fn find_event<C: Connection>(
        db: &mut C,
        key: &TargetEventKey,
    ) -> Result<Option<CalendarEventRow<StartAt>>, Status> {
        select_calendar_events()
            .expr_as(
                Expr::col(
                    content_calendar_event::Column::StartAt.as_column_ref(),
                ),
                SORTED_BY_COLUMN,
            )
            .filter(event::Column::Identity.eq(key.identity.as_str()))
            .filter(event::Column::PublicKeyType.eq(key.public_key_type))
            .filter(event::Column::PublicKey.eq(key.public_key.clone()))
            .filter(event::Column::Sequence.eq(key.sequence))
            .into_tuple()
            .one(db)
            .await
            .map_err(map_db_err)
    }

    /// List the RSVPs to a calendar event, newest first
    #[tracing::instrument(skip_all)]
    pub async fn list_rsvps<C: Connection>(
        db: &mut C,
        target: &TargetEventKey,
        status: Option<CalendarEventRsvpStatus>,
        limit: u64,
        cursor_filter: &CursorFilter<EventCreatedAt>,
    ) -> Result<Vec<EventWithContentRow>, Status> {
        let mut calendar_event_id = SelectStatement::new();
        calendar_event_id
            .column(event::Column::Id)
            .from(event::Entity)
            .and_where(event::Column::Collection.eq(target.collection))
            .and_where(event::Column::Identity.eq(target.identity.as_str()))
            .and_where(event::Column::PublicKeyType.eq(target.public_key_type))
            .and_where(event::Column::PublicKey.eq(target.public_key.clone()))
            .and_where(event::Column::Sequence.eq(target.sequence));

        let mut query = event::Entity::find()
            .select_also(content::Entity)
            .join(JoinType::InnerJoin, content_join())
            .join(
                JoinType::InnerJoin,
                calendar_event_rsvp::Relation::Event.def().rev(),
            )
            .filter(
                calendar_event_rsvp::Column::OnEvent
                    .in_subquery(calendar_event_id),
            );
        if let Some(status) = status {
            query = query
                .filter(calendar_event_rsvp::Column::Status.eq(status as i16));
        }

        let mut sea_cursor =
            query.cursor_by((event::Column::CreatedAt, event::Column::Id));
        sea_cursor.desc();
        match cursor_filter {
            CursorFilter::Forward(cur) => {
                match cur {
                    Cursor::Start => {}
                    Cursor::Mid(marker) => {
                        sea_cursor.after(marker.values());
                    }
                    Cursor::End => return Ok(vec![]),
                }
                sea_cursor.first(limit);
            }
            CursorFilter::Backward(cur) => {
                match cur {
                    Cursor::Start => return Ok(vec![]),
                    Cursor::Mid(marker) => {
                        sea_cursor.before(marker.values());
                    }
                    Cursor::End => {}
                }
                sea_cursor.last(limit);
            }
        }
        sea_cursor.all(db).await.map_err(map_db_err)
    }

    /// RSVP counts for each calendar event. Hosting RSVPs aren't counted
    #[tracing::instrument(skip_all)]
    pub async fn count_rsvps<C: Connection>(
        db: &mut C,
        event_ids: &[EventId],
    ) -> Result<HashMap<EventId, CalendarEventStats>, Status> {
        if event_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let rows: Vec<(EventId, i16, i64)> =
            calendar_event_rsvp::Entity::find()
                .select_only()
                .column(calendar_event_rsvp::Column::OnEvent)
                .column(calendar_event_rsvp::Column::Status)
                .column_as(
                    calendar_event_rsvp::Column::EventId.count(),
                    "count",
                )
                // Not from deleted identities, whose events are gone
                .join(
                    JoinType::InnerJoin,
                    calendar_event_rsvp::Relation::Event.def(),
                )
                .filter(
                    calendar_event_rsvp::Column::OnEvent
                        .is_in(event_ids.iter().copied()),
                )
                .group_by(calendar_event_rsvp::Column::OnEvent)
                .group_by(calendar_event_rsvp::Column::Status)
                .into_tuple()
                .all(db)
                .await
                .map_err(map_db_err)?;

        let mut stats: HashMap<EventId, CalendarEventStats> = HashMap::new();
        for (on_event, status, count) in rows {
            let stats = stats.entry(on_event).or_default();
            match CalendarEventRsvpStatus::try_from(i32::from(status)) {
                Ok(CalendarEventRsvpStatus::Going) => stats.going_count = count,
                Ok(CalendarEventRsvpStatus::Maybe) => stats.maybe_count = count,
                Ok(CalendarEventRsvpStatus::NotGoing) => {
                    stats.not_going_count = count
                }
                Ok(
                    CalendarEventRsvpStatus::Hosting
                    | CalendarEventRsvpStatus::Unspecified,
                )
                | Err(_) => {}
            }
        }
        Ok(stats)
    }

    /// Named hosts who accepted. Doesn't include the creator
    #[tracing::instrument(skip_all)]
    pub async fn confirmed_hosts<C: Connection>(
        db: &mut C,
        event_ids: &[EventId],
    ) -> Result<HashMap<EventId, Vec<String>>, Status> {
        if event_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let rows: Vec<(EventId, String)> = calendar_event_rsvp::Entity::find()
            .select_only()
            .column(calendar_event_rsvp::Column::OnEvent)
            .column(calendar_event_rsvp::Column::Identity)
            // Not from deleted identities, whose events are gone
            .join(
                JoinType::InnerJoin,
                calendar_event_rsvp::Relation::Event.def(),
            )
            .filter(
                calendar_event_rsvp::Column::OnEvent
                    .is_in(event_ids.iter().copied()),
            )
            .filter(calendar_event_rsvp::Column::Status.eq(HOSTING))
            .order_by_asc(calendar_event_rsvp::Column::EventId)
            .into_tuple()
            .all(db)
            .await
            .map_err(map_db_err)?;

        let mut hosts: HashMap<EventId, Vec<String>> = HashMap::new();
        for (on_event, host) in rows {
            hosts.entry(on_event).or_default().push(host);
        }
        Ok(hosts)
    }
}

/// Calendar events that aren't deleted, with their content
fn select_calendar_events() -> Select<event::Entity> {
    let mut query = event::Entity::find().select_only();
    select_model_columns(
        QuerySelect::query(&mut query),
        EVENT_PREFIX,
        event::Column::iter(),
    );
    select_model_columns(
        QuerySelect::query(&mut query),
        CONTENT_PREFIX,
        content::Column::iter(),
    );
    query
        .join(JoinType::InnerJoin, content_join())
        .join(
            JoinType::InnerJoin,
            content::Relation::ContentCalendarEvent.def(),
        )
        .filter(event::Column::Collection.eq(CALENDAR_COLLECTION))
        .filter(Expr::exists(deletes_by_author()).not())
}

/// One page of `query`, ordered by `sorted_by` then event id
async fn page<C, SortedBy>(
    db: &mut C,
    mut query: Select<event::Entity>,
    sorted_by: Expr,
    descending: bool,
    limit: u64,
    cursor_filter: &CursorFilter<SortedBy>,
) -> Result<Vec<CalendarEventRow<SortedBy>>, Status>
where
    C: Connection,
    SortedBy: Clone + Into<Value> + TryGetable,
{
    // Backward pages are read in reverse so they hold the rows nearest the
    // cursor, then flipped back.
    let (cursor, backward) = match cursor_filter {
        CursorFilter::Forward(Cursor::End)
        | CursorFilter::Backward(Cursor::Start) => return Ok(Vec::new()),
        CursorFilter::Forward(cursor) => (cursor, false),
        CursorFilter::Backward(cursor) => (cursor, true),
    };
    let read_descending = descending != backward;
    if let Cursor::Mid(marker) = cursor {
        let row = Expr::tuple([
            sorted_by.clone(),
            Expr::col(event::Column::Id.as_column_ref()),
        ]);
        let at = Expr::tuple([
            Expr::value(marker.sorted_by.clone()),
            Expr::value(marker.event_id),
        ]);
        query = query.filter(if read_descending {
            row.lt(at)
        } else {
            row.gt(at)
        });
    }
    let read_order = if read_descending {
        Order::Desc
    } else {
        Order::Asc
    };
    QueryOrder::query(&mut query)
        .order_by_expr(sorted_by.clone(), read_order.clone())
        .order_by(event::Column::Id.as_column_ref(), read_order);

    let mut rows: Vec<CalendarEventRow<SortedBy>> = query
        .expr_as(sorted_by, SORTED_BY_COLUMN)
        .limit(limit)
        .into_tuple()
        .all(db)
        .await
        .map_err(map_db_err)?;
    if backward {
        rows.reverse();
    }
    Ok(rows)
}

/// When a calendar event finishes. With no end that's its start, or the end
/// of the day if it's all day.
pub(crate) fn ends_at() -> Expr {
    let start_at =
        Expr::col(content_calendar_event::Column::StartAt.as_column_ref());
    Func::coalesce([
        Expr::col(content_calendar_event::Column::EndAt.as_column_ref()),
        Expr::case(
            Expr::col(content_calendar_event::Column::AllDay.as_column_ref()),
            start_at.clone().add(Expr::cust("INTERVAL '1 day'")),
        )
        .finally(start_at)
        .into(),
    ])
    .into()
}

/// Subquery of `identity`'s RSVP to the outer query's calendar event.
fn rsvp_by(identity: &str) -> SelectStatement {
    let mut query = SelectStatement::new();
    query
        .expr(Expr::Constant(1.into()))
        .from(calendar_event_rsvp::Entity)
        .and_where(
            Expr::col(calendar_event_rsvp::Column::OnEvent.as_column_ref())
                .equals(event::Column::Id.as_column_ref()),
        )
        .and_where(calendar_event_rsvp::Column::Identity.eq(identity));
    query
}

fn map_db_err(e: sea_orm::DbErr) -> Status {
    tracing::error!(error = %e, "calendar repository db error");
    Status::internal("internal server error")
}
