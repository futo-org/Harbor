use super::{ChildContext, map_db_err, split_event_key};
use crate::service::proto::Reaction;
use ::entity::content_reaction_model as ContentReactionModel;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait};
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    reaction: Reaction,
) -> Result<(), Status> {
    // A reaction targets either an in-network event (`event_key`) or an
    // external subject via `attributed_to` — e.g. a URL (video like/dislike).
    let Some(event_key) = reaction.event_key else {
        // URL/attributed reaction: accept and store as generic content (so it
        // syncs and each client can query its own opinions locally), but write
        // no typed `content_reaction` row — that table is event-keyed, and
        // server-side URL reaction counts are intentionally not maintained.
        if reaction.attributed_to.is_none() {
            return Err(Status::invalid_argument(
                "reaction must set event_key or attributed_to",
            ));
        }
        return Ok(());
    };

    let key = split_event_key(Some(event_key), "reaction content")?;

    ContentReactionModel::ActiveModel {
        content_id: Set(ctx.content_id),
        event_key_collection: Set(key.collection),
        event_key_identity: Set(key.identity),
        event_key_public_key_type: Set(key.public_key_type),
        event_key_public_key: Set(key.public_key),
        event_key_sequence: Set(key.sequence),
        emoji: Set(reaction.emoji),
        positive: Set(reaction.positive),
    }
    .insert(db)
    .await
    .map_err(map_db_err)?;

    Ok(())
}
