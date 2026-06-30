use super::{ChildContext, map_db_err};
use crate::service::proto::Post;
use ::entity::content_post_model as ContentPostModel;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait};
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    post: Post,
) -> Result<(), Status> {
    let (reply_root, reply_parent) = match post.reply {
        Some(reply) => (reply.root, reply.parent),
        None => (None, None),
    };
    let quote = post.quote;

    ContentPostModel::ActiveModel {
        content_id: Set(ctx.content_id),
        text: Set(post.text),
        reply_root_collection: Set(reply_root
            .as_ref()
            .map(|k| k.collection as i16)),
        reply_root_identity: Set(reply_root
            .as_ref()
            .map(|k| k.identity.clone())),
        reply_root_public_key_type: Set(reply_root
            .as_ref()
            .and_then(|k| k.signed_by.as_ref().map(|s| s.key_type as i16))),
        reply_root_public_key: Set(reply_root
            .as_ref()
            .and_then(|k| k.signed_by.as_ref().map(|s| s.key.clone()))),
        reply_root_sequence: Set(reply_root
            .as_ref()
            .map(|k| k.sequence as i64)),
        reply_parent_collection: Set(reply_parent
            .as_ref()
            .map(|k| k.collection as i16)),
        reply_parent_identity: Set(reply_parent
            .as_ref()
            .map(|k| k.identity.clone())),
        reply_parent_public_key_type: Set(reply_parent
            .as_ref()
            .and_then(|k| k.signed_by.as_ref().map(|s| s.key_type as i16))),
        reply_parent_public_key: Set(reply_parent
            .as_ref()
            .and_then(|k| k.signed_by.as_ref().map(|s| s.key.clone()))),
        reply_parent_sequence: Set(reply_parent
            .as_ref()
            .map(|k| k.sequence as i64)),
        quote_collection: Set(quote.as_ref().map(|k| k.collection as i16)),
        quote_identity: Set(quote.as_ref().map(|k| k.identity.clone())),
        quote_public_key_type: Set(quote
            .as_ref()
            .and_then(|k| k.signed_by.as_ref().map(|s| s.key_type as i16))),
        quote_public_key: Set(quote
            .as_ref()
            .and_then(|k| k.signed_by.as_ref().map(|s| s.key.clone()))),
        quote_sequence: Set(quote.as_ref().map(|k| k.sequence as i64)),
    }
    .insert(db)
    .await
    .map_err(map_db_err)?;

    Ok(())
}
