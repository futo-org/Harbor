//! `get_attributed_to_stats`: the post and reaction counts of a URL.

use tonic::Status;

use crate::service::context::PublicContext;
use crate::service::feeds::repository::Query as FeedsRepository;
use crate::service::feeds::util::map_db_err;
use crate::service::proto::{
    GetAttributedToStatsRequest, GetAttributedToStatsResponse,
    attributed_to::To,
};
use crate::service::stats::repository::Query as StatsRepository;

pub async fn handle(
    mut ctx: PublicContext,
    req: GetAttributedToStatsRequest,
) -> Result<GetAttributedToStatsResponse, Status> {
    let url = match req.attributed_to.and_then(|a| a.to) {
        Some(To::Link(link)) if !link.url.is_empty() => link.url,
        _ => {
            return Err(Status::invalid_argument(
                "attributed_to link url is required",
            ));
        }
    };

    let (upvote_count, downvote_count) =
        StatsRepository::get_attributed_reaction_summary(&mut ctx.db, &url)
            .await
            .map_err(map_db_err)?;
    let post_count = FeedsRepository::count_posts_attributed_to_url(
        &mut ctx.db,
        url,
        req.omit_labels,
    )
    .await
    .map_err(map_db_err)?;

    Ok(GetAttributedToStatsResponse {
        post_count,
        upvote_count,
        downvote_count,
    })
}
