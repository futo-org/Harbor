use super::{ChildContext, map_db_err};
use crate::service::proto::{AttributedToReaction, attributed_to::To};
use ::entity::content_attributed_to_reaction_model as Model;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait};
use tonic::Status;

/// Persist an out-of-network reaction (a reaction to a URL, e.g. a video
/// like/dislike) as a typed row keyed by the attributed URL, so per-URL
/// reaction counts can be maintained.
pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    reaction: AttributedToReaction,
) -> Result<(), Status> {
    let url = match reaction.attributed_to.and_then(|a| a.to) {
        Some(To::Link(link)) => link.url,
        _ => {
            return Err(Status::invalid_argument(
                "attributed_to_reaction must attribute to a link url",
            ));
        }
    };

    Model::ActiveModel {
        content_id: Set(ctx.content_id),
        url: Set(url),
        emoji: Set(reaction.emoji),
        positive: Set(reaction.positive),
    }
    .insert(db)
    .await
    .map_err(map_db_err)?;

    Ok(())
}
