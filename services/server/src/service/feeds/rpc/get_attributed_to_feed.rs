//! `get_attributed_to_feed`: the URLs recent posts are attributed to, with
//! their post counts.

use std::collections::HashMap;

use prost::Message;
use tonic::Status;

use crate::data::{CursorFilter, Marker, PaginationParams, pipeline};
use crate::service::context::PublicContext;
use crate::service::feeds::repository::{
    AttributedUrl, AttributedUrlSortKey, AttributedUrlsFilter,
    Query as FeedsRepository,
};
use crate::service::feeds::util::map_db_err;
use crate::service::proto::content::ContentBody;
use crate::service::proto::{
    AttributedTo, AttributedToFeedItem, Content, GetAttributedToFeedRequest,
    GetAttributedToFeedResponse, Link, SortPostsBy, attributed_to::To,
};

/// How far back posts count towards a target.
const WITHIN_DAYS: i32 = 30;

pub struct Params {
    pub filter: AttributedUrlsFilter,
    pub sort_by: SortPostsBy,
    pub limit: u32,
    pub cursor_filter: CursorFilter<AttributedUrlSortKey>,
}

type Fetched = pipeline::Fetched<AttributedUrl, AttributedUrlSortKey>;

/// Serialized content of each URL's latest post, by event id.
type Hydrated = HashMap<i64, Vec<u8>>;

pub async fn handle(
    mut ctx: PublicContext,
    req: GetAttributedToFeedRequest,
) -> Result<GetAttributedToFeedResponse, Status> {
    let sort_by = req.sort_by();
    let GetAttributedToFeedRequest {
        identity: _,
        page_params,
        sort_by: _,
        only_applications,
        omit_applications,
    } = req;
    let PaginationParams {
        cursor_filter,
        limit,
    } = PaginationParams::from_req_params(page_params.as_ref())?;
    let params = Params {
        filter: AttributedUrlsFilter {
            within_days: WITHIN_DAYS,
            only_applications,
            omit_applications,
        },
        sort_by,
        limit,
        cursor_filter,
    };

    pipeline::create_pipeline(&mut ctx, &params, fetch, hydrate, filter, view)
        .await
}

async fn fetch(
    ctx: &mut PublicContext,
    params: &Params,
) -> Result<Fetched, Status> {
    let mut rows = FeedsRepository::attributed_urls(
        &mut ctx.db,
        params.filter.clone(),
        params.sort_by,
        u64::from(params.limit) + 1, // For pagination.
        &params.cursor_filter,
    )
    .await
    .map_err(map_db_err)?;
    let page_info = pipeline::finalize_fetch(
        &mut rows,
        &params.cursor_filter,
        params.limit,
        |row| Marker {
            sorted_by: AttributedUrlSortKey {
                decayed_post_count: row.decayed_post_count.clone(),
                url: row.url.clone(),
            },
            event_id: row.latest_event_id,
        },
    );
    Ok(Fetched { rows, page_info })
}

/// Title, description and image come from each URL's latest post.
async fn hydrate(
    ctx: &mut PublicContext,
    _: &Params,
    fetched: &Fetched,
) -> Result<Hydrated, Status> {
    let latest = FeedsRepository::list_events_by_ids(
        &mut ctx.db,
        fetched.rows.iter().map(|row| row.latest_event_id).collect(),
    )
    .await
    .map_err(map_db_err)?;
    Ok(latest
        .into_iter()
        .filter_map(|(event, content)| {
            Some((event.id, content?.serialized_bytes))
        })
        .collect())
}

/// The query has already left out what should not be counted.
async fn filter(
    _: &mut PublicContext,
    _: &Params,
    fetched: Fetched,
    _: &Hydrated,
) -> Result<Fetched, Status> {
    Ok(fetched)
}

async fn view(
    _: &mut PublicContext,
    _: &Params,
    filtered: Fetched,
    latest: Hydrated,
) -> Result<GetAttributedToFeedResponse, Status> {
    let items = filtered
        .rows
        .into_iter()
        .map(|row| {
            let link = latest
                .get(&row.latest_event_id)
                .and_then(|bytes| attributed_link(bytes, &row.url))
                .unwrap_or_else(|| Link {
                    url: row.url,
                    ..Default::default()
                });
            AttributedToFeedItem {
                attributed_to: Some(AttributedTo {
                    to: Some(To::Link(link)),
                }),
                post_count: row.post_count,
            }
        })
        .collect();

    Ok(GetAttributedToFeedResponse {
        items,
        page_info: Some(filtered.page_info.to_proto()?),
    })
}

/// The link to `url` that a serialized post is attributed to.
fn attributed_link(content_bytes: &[u8], url: &str) -> Option<Link> {
    let content = Content::decode(content_bytes).ok()?;
    let Some(ContentBody::Post(post)) = content.content_body else {
        return None;
    };
    post.attributed_to
        .into_iter()
        .find_map(|attributed_to| match attributed_to.to {
            Some(To::Link(link)) if link.url == url => Some(link),
            _ => None,
        })
}
