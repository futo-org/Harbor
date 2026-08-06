//! `search_users`: searches users.

use crate::data::hydration::HydrationState;
use crate::data::pipeline;
use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::events::tombstone;
use crate::service::feeds::repository::EventWithContentRow;
use crate::service::feeds::rpc::common::to_target_event_keys;
use crate::service::identity::service::{
    collect_identities, list_identity_events, list_profile_events,
};
use crate::service::proto::{
    Content, EventKey, SearchUsersRequest, SearchUsersResponse, SortUsersBy,
};
use crate::service::search::repository::Query;
use crate::service::search::rpc::{
    self, Fetched, Marker, SearchResponseFilter, SearchResponseView, SortedBy,
    finalize_fetch,
};
use crate::service::stats::service::EventStats;
use polycentric_common::models::protos_v2::content::ContentBody;
use prost::Message;
use tonic::Status;

struct Params {
    common: rpc::Params,
    sort_by: SortUsersBy,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: SearchUsersRequest,
) -> Result<SearchUsersResponse, Status> {
    let sort_by = req.sort_by();
    let common = rpc::Params::from_req_params(req.query, &req.page_params)?;
    let params = Params { common, sort_by };
    let result =
        pipeline::create_pipeline(ctx, &params, fetch, hydrate, filter, view)
            .await?;
    Ok(SearchUsersResponse {
        event_bundles: result.event_bundles,
        event_hints: result.event_hints,
        page_info: Some(result.page_info.proto()?),
    })
}

async fn fetch(
    ctx: &ServiceContext,
    params: &Params,
) -> Result<Fetched, Status> {
    let mut rows = Query::search_users(
        &ctx.db,
        &params.common.query,
        params.sort_by,
        params.common.limit,
        params.common.cursor_filter.as_ref(),
    )
    .await?;
    let page_info = finalize_fetch(&mut rows, &params.common, |row| Marker {
        sorted_by: match params.sort_by {
            SortUsersBy::Default => SortedBy::Rank(row.search_rank),
            SortUsersBy::Alpha => SortedBy::Name(row.profile_name.clone()),
        },
        id: row.event.id,
    });
    let rows = rows
        .into_iter()
        .map(|event| (event.event, Some(event.content)))
        .collect();
    Ok(Fetched { rows, page_info })
}

async fn hydrate(
    ctx: &ServiceContext,
    _: &Params,
    fetched: &Fetched,
) -> Result<HydrationState, Status> {
    let rows = &fetched.rows;

    let keys: Vec<TargetEventKey> =
        rows.iter().map(|(e, _)| TargetEventKey::of(e)).collect();
    let identities = collect_identities(
        rows.iter()
            .map(|(event, content)| (event, content.as_ref())),
    );
    let ref_keys = collect_referenced_keys(rows);
    let mut target_event_keys = to_target_event_keys(&ref_keys);

    // Event keys for all referenced post events that may be displayed by the client.
    // Fetch labels and additional metadata for these.
    let display_keys: Vec<TargetEventKey> = {
        target_event_keys.extend(keys);
        target_event_keys.into_iter().collect()
    };

    let tombstones_fut = tombstone::validated_tombstones(ctx, &display_keys);
    let identity_events_fut = list_identity_events(ctx, identities.clone());
    let profile_events_fut = list_profile_events(ctx, identities);

    let (deletes_by_target, identity_events, profile_events) = tokio::try_join!(
        tombstones_fut,
        identity_events_fut,
        profile_events_fut,
    )?;

    Ok(HydrationState {
        deletes_by_target,
        identity_events,
        profile_events,
        // Unused in searching of users.
        quote_post_events: Vec::new(),
        repost_events: Vec::new(),
        label_events: Vec::new(),
        stats: EventStats::none(),
    })
}

fn collect_referenced_keys(rows: &[EventWithContentRow]) -> Vec<EventKey> {
    let mut keys = Vec::with_capacity(rows.len());
    let mut push_key = |maybe_key: Option<EventKey>| {
        if let Some(key) = maybe_key {
            keys.push(key);
        }
    };
    for (_event, content) in rows {
        let Some(content) = content else {
            continue;
        };
        let Ok(decoded) = Content::decode(content.serialized_bytes.as_slice())
        else {
            continue;
        };
        match decoded.content_body {
            Some(ContentBody::Post(post)) => {
                push_key(post.quote);
            }
            Some(ContentBody::Delete(delete)) => {
                push_key(delete.event_key);
            }
            Some(ContentBody::Reaction(reaction)) => {
                push_key(reaction.event_key);
            }
            Some(ContentBody::Repost(repost)) => {
                push_key(repost.post);
            }
            Some(ContentBody::Report(report)) => {
                push_key(report.event_key);
            }
            Some(ContentBody::Labels(labels)) => {
                push_key(labels.event_key);
            }
            Some(ContentBody::VerificationVerify(verify)) => {
                push_key(verify.claim_event_key);
            }
            Some(ContentBody::VerificationTarget(target)) => {
                push_key(target.claim_event_key);
            }
            // Don't have event keys.
            Some(ContentBody::Follow(_))
            | Some(ContentBody::Block(_))
            | Some(ContentBody::ProfileUpdate(_))
            | Some(ContentBody::Identity(_))
            | Some(ContentBody::VerificationClaim(_))
            | None => {}
        }
    }
    keys
}

async fn filter(
    _: &ServiceContext,
    _: &Params,
    fetched: Fetched,
    hydration: &HydrationState,
) -> Result<SearchResponseFilter, Status> {
    let omit_labels = &[];
    rpc::filter(fetched, hydration, omit_labels).await
}

async fn view(
    ctx: &ServiceContext,
    _: &Params,
    filtered: SearchResponseFilter,
    hydration: HydrationState,
) -> Result<SearchResponseView, Status> {
    rpc::view(ctx, filtered, hydration).await
}
