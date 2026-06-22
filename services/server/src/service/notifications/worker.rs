//! Notification worker.
//!
//! Consumes the `events` topic and turns relevant events (replies, follows,
//! reposts, reactions) into rows in the `notification` table.

use std::sync::{Arc, LazyLock};
use std::time::Duration;

use ::entity::notification;
use chrono::Utc;
use common_kafka::{BorrowedMessage, FutureRecord, Message};
use polycentric_common::models::protos_v2::{
    Content, Event, EventBundle, EventKey, Notification, NotificationKind,
    content::ContentBody,
};
use prost::Message as _;
use rdkafka::message::{Header, OwnedHeaders};
use sea_orm::{ActiveModelTrait, NotSet, Set};

use crate::service::context::ServiceContext;
use crate::service::feeds::repository::Query as FeedsRepository;
use crate::service::identity::service::rows_to_bundles;
use crate::service::proofs::service::attach_proofs;
use crate::workers::{MessageHandler, Outcome, WorkerError, run_consumer};

/// Identifies this server as the source of produced notification events, so
/// downstream consumers can filter by origin (matching the `events` topic).
static SERVER_NAME: LazyLock<String> = LazyLock::new(|| {
    std::env::var("POLYCENTRIC_SERVER_NAME").unwrap_or_default()
});

/// Kafka topic the materialized `Notification` messages are produced to.
const NOTIFICATIONS_TOPIC: &str = "notifications";

pub struct NotificationWorker {
    ctx: Arc<ServiceContext>,
}

impl NotificationWorker {
    /// Stable identifier; also the Kafka consumer group id (the unit of
    /// horizontal scaling).
    pub const NAME: &'static str = "server-notification-worker";

    pub fn new(ctx: Arc<ServiceContext>) -> Self {
        Self { ctx }
    }

    pub async fn run(self) -> Result<(), WorkerError> {
        println!("[{}] consuming `events`", Self::NAME);
        run_consumer(Self::NAME, &["events"], self).await
    }

    /// Load the target event by its key and assemble it into an
    /// `EventBundle` (with revocation proofs attached), mirroring how feeds
    /// build bundles. Returns `Ok(None)` when the target isn't stored on this
    /// server (a legitimate miss — e.g. a reply to a post we never received);
    /// a DB/proof error propagates so the message is retried.
    async fn hydrate_target(
        &self,
        key: &EventKey,
    ) -> Result<Option<EventBundle>, WorkerError> {
        let Some(signed_by) = key.signed_by.as_ref() else {
            return Ok(None);
        };

        let Some(row) = FeedsRepository::find_event_by_key(
            &self.ctx.db,
            key.collection as i16,
            &key.identity,
            signed_by.key_type as i16,
            signed_by.key.clone(),
            key.sequence as i64,
        )
        .await?
        else {
            return Ok(None);
        };

        let mut bundles = rows_to_bundles(vec![row]);
        attach_proofs(&self.ctx, &mut bundles).await?;
        Ok(bundles.into_iter().next())
    }

    // Emit a Notification event to Kafka, that can be consumed by the push-notifications service
    async fn emit(
        &self,
        to_identity: &str,
        notification_type: NotificationKind,
        trigger: EventBundle,
        target_event: Option<EventBundle>,
    ) -> Result<(), WorkerError> {
        let payload = Notification {
            trigger_event: Some(trigger),
            target_event,
            kind: notification_type as i32,
        }
        .encode_to_vec();

        let record = FutureRecord::to(NOTIFICATIONS_TOPIC)
            .key(to_identity.as_bytes())
            .payload(&payload)
            .headers(OwnedHeaders::new().insert(Header {
                key: "SOURCE_SERVER",
                value: Some(SERVER_NAME.as_str()),
            }));

        self.ctx
            .kafka_producer
            .send(record, Duration::from_secs(0))
            .await
            .map(|_| ())
            .map_err(|(e, _)| e.into())
    }
}

#[tonic::async_trait]
impl MessageHandler for NotificationWorker {
    async fn handle(&self, message: &BorrowedMessage<'_>) -> Outcome {
        let Some(payload) = message.payload() else {
            return Outcome::Commit;
        };

        let bundle = match EventBundle::decode(payload) {
            Ok(bundle) => bundle,
            Err(e) => {
                // Undecodable payloads will never succeed — commit past.
                eprintln!("[{}] failed to decode EventBundle: {e}", Self::NAME);
                return Outcome::Commit;
            }
        };

        // The triggering event (its key) and its content. Anything that
        // doesn't decode produces no notification — nothing to retry.
        let Some(signed) = bundle.signed_event.as_ref() else {
            return Outcome::Commit;
        };
        let Ok(event) = Event::decode(signed.event_bytes.as_slice()) else {
            return Outcome::Commit;
        };
        let Some(trigger_key) = event.key.as_ref() else {
            return Outcome::Commit;
        };
        let Some(serialized) = bundle.serialized_content.as_ref() else {
            return Outcome::Commit;
        };
        let Ok(content) = Content::decode(serialized.content_bytes.as_slice())
        else {
            return Outcome::Commit;
        };

        // Not every event produces a notification (and self-actions never
        // do).
        let Some(Derived {
            notification_type,
            to_identity,
            target,
        }) = derive(&trigger_key.identity, &content)
        else {
            return Outcome::Commit;
        };

        println!(
            "[{}] processing {notification_type:?} notification: from={} to={to_identity}",
            Self::NAME,
            trigger_key.identity,
        );

        let trigger = KeyColumns::from(trigger_key);
        // Follows have no target event; store an empty key for them.
        let target_cols =
            target.as_ref().map(KeyColumns::from).unwrap_or_default();
        let now = Utc::now();

        // NOTE: a redelivered message (rebalance / crash before commit) will
        // insert a duplicate row until a unique dedup index exists to make
        // this an upsert.
        let row = notification::ActiveModel {
            id: NotSet,
            kind: Set(notification_type as i32),
            from_identity: Set(trigger.identity.clone()),
            to_identity: Set(to_identity.clone()),
            trigger_event_key_collection: Set(trigger.collection),
            trigger_event_key_identity: Set(trigger.identity),
            trigger_event_key_public_key_type: Set(trigger.public_key_type),
            trigger_event_key_public_key: Set(trigger.public_key),
            trigger_event_key_sequence: Set(trigger.sequence),
            target_event_key_collection: Set(target_cols.collection),
            target_event_key_identity: Set(target_cols.identity),
            target_event_key_public_key_type: Set(target_cols.public_key_type),
            target_event_key_public_key: Set(target_cols.public_key),
            target_event_key_sequence: Set(target_cols.sequence),
            created_at: Set(now),
            updated_at: Set(now),
        };

        if let Err(e) = row.insert(&self.ctx.db).await {
            eprintln!("[{}] failed to insert notification: {e}", Self::NAME);
            return Outcome::Retry;
        }

        // Hydrate the target event (the post replied to / reposted / reacted
        // to) so the produced `Notification` carries it. Follows have none.
        let target_event = match target.as_ref() {
            Some(key) => match self.hydrate_target(key).await {
                Ok(bundle) => bundle,
                Err(e) => {
                    eprintln!(
                        "[{}] failed to hydrate target event: {e}",
                        Self::NAME
                    );
                    return Outcome::Retry;
                }
            },
            None => None,
        };

        match self
            .emit(&to_identity, notification_type, bundle, target_event)
            .await
        {
            Ok(()) => {
                println!(
                    "[{}] created {notification_type:?} notification for {to_identity}",
                    Self::NAME
                );
                Outcome::Commit
            }
            Err(e) => {
                eprintln!(
                    "[{}] failed to produce notification: {e}",
                    Self::NAME
                );
                Outcome::Retry
            }
        }
    }
}

/// A derived notification: its type, the recipient, and the event it refers
/// to (absent for follows).
struct Derived {
    notification_type: NotificationKind,
    to_identity: String,
    target: Option<EventKey>,
}

/// Determine the notification a single event produces, if any. `author` is
/// the identity of the triggering event; self-actions (replying to your own
/// post, following yourself, …) produce nothing.
fn derive(author: &str, content: &Content) -> Option<Derived> {
    let make =
        |notification_type, to_identity: &str, target: Option<EventKey>| {
            (to_identity != author).then(|| Derived {
                notification_type,
                to_identity: to_identity.to_string(),
                target,
            })
        };

    match content.content_body.as_ref()? {
        // A post is a reply (notify the parent's author) or a quote (notify
        // the quoted post's author). Reply takes precedence when both are set.
        ContentBody::Post(post) => {
            if let Some(parent) =
                post.reply.as_ref().and_then(|reply| reply.parent.as_ref())
            {
                make(
                    NotificationKind::Reply,
                    &parent.identity,
                    Some(parent.clone()),
                )
            } else if let Some(quote) = post.quote.as_ref() {
                make(
                    NotificationKind::Quote,
                    &quote.identity,
                    Some(quote.clone()),
                )
            } else {
                None
            }
        }
        // Repost -> notify the author of the reposted post.
        ContentBody::Repost(repost) => {
            let post = repost.post.as_ref()?;
            make(NotificationKind::Repost, &post.identity, Some(post.clone()))
        }
        // Reaction -> notify the author of the reacted-to event.
        ContentBody::Reaction(reaction) => {
            let target = reaction.event_key.as_ref()?;
            make(
                NotificationKind::Reaction,
                &target.identity,
                Some(target.clone()),
            )
        }
        // Follow -> notify the followed identity (no target event).
        ContentBody::Follow(follow) => {
            make(NotificationKind::Follow, &follow.identity, None)
        }
        _ => None,
    }
}

/// An `EventKey` flattened into the columns the `notification` table stores.
/// `Default` yields the empty key used for notifications without a target
/// event (follows).
#[derive(Default)]
struct KeyColumns {
    collection: i16,
    identity: String,
    public_key_type: i16,
    public_key: Vec<u8>,
    sequence: i64,
}

impl From<&EventKey> for KeyColumns {
    fn from(key: &EventKey) -> Self {
        let (public_key_type, public_key) = key
            .signed_by
            .as_ref()
            .map(|pk| (pk.key_type as i16, pk.key.clone()))
            .unwrap_or_default();
        KeyColumns {
            collection: key.collection as i16,
            identity: key.identity.clone(),
            public_key_type,
            public_key,
            sequence: key.sequence as i64,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use polycentric_common::models::protos_v2::{
        Block, Follow, Post, PostReply, PublicKey, Reaction, Repost,
    };

    /// A fully-populated `EventKey` for `identity`.
    fn event_key(identity: &str) -> EventKey {
        EventKey {
            collection: 2,
            identity: identity.to_string(),
            signed_by: Some(PublicKey {
                key_type: 1,
                key: vec![0xAB, 0xCD],
            }),
            sequence: 7,
        }
    }

    fn content(body: ContentBody) -> Content {
        Content {
            content_body: Some(body),
        }
    }

    #[test]
    fn reply_to_another_user_notifies_the_parent_author() {
        let parent = event_key("bob");
        let c = content(ContentBody::Post(Post {
            reply: Some(PostReply {
                root: None,
                parent: Some(parent.clone()),
            }),
            ..Default::default()
        }));

        let derived = derive("alice", &c).expect("reply should notify");
        assert_eq!(derived.notification_type, NotificationKind::Reply);
        assert_eq!(derived.to_identity, "bob");
        assert_eq!(derived.target, Some(parent));
    }

    #[test]
    fn self_reply_does_not_notify() {
        let c = content(ContentBody::Post(Post {
            reply: Some(PostReply {
                root: None,
                parent: Some(event_key("alice")),
            }),
            ..Default::default()
        }));
        assert!(derive("alice", &c).is_none());
    }

    #[test]
    fn post_without_a_reply_does_not_notify() {
        let c = content(ContentBody::Post(Post::default()));
        assert!(derive("alice", &c).is_none());
    }

    #[test]
    fn quote_notifies_the_quoted_author() {
        let quoted = event_key("bob");
        let c = content(ContentBody::Post(Post {
            quote: Some(quoted.clone()),
            ..Default::default()
        }));

        let derived = derive("alice", &c).expect("quote should notify");
        assert_eq!(derived.notification_type, NotificationKind::Quote);
        assert_eq!(derived.to_identity, "bob");
        assert_eq!(derived.target, Some(quoted));
    }

    #[test]
    fn repost_notifies_the_reposted_author() {
        let target = event_key("bob");
        let c = content(ContentBody::Repost(Repost {
            post: Some(target.clone()),
        }));

        let derived = derive("alice", &c).expect("repost should notify");
        assert_eq!(derived.notification_type, NotificationKind::Repost);
        assert_eq!(derived.to_identity, "bob");
        assert_eq!(derived.target, Some(target));
    }

    #[test]
    fn reaction_notifies_the_reacted_author() {
        let target = event_key("bob");
        let c = content(ContentBody::Reaction(Reaction {
            event_key: Some(target.clone()),
            emoji: None,
            positive: true,
        }));

        let derived = derive("alice", &c).expect("reaction should notify");
        assert_eq!(derived.notification_type, NotificationKind::Reaction);
        assert_eq!(derived.to_identity, "bob");
        assert_eq!(derived.target, Some(target));
    }

    #[test]
    fn follow_notifies_the_followed_user_without_a_target() {
        let c = content(ContentBody::Follow(Follow {
            identity: "bob".to_string(),
        }));

        let derived = derive("alice", &c).expect("follow should notify");
        assert_eq!(derived.notification_type, NotificationKind::Follow);
        assert_eq!(derived.to_identity, "bob");
        assert_eq!(derived.target, None);
    }

    #[test]
    fn self_follow_does_not_notify() {
        let c = content(ContentBody::Follow(Follow {
            identity: "alice".to_string(),
        }));
        assert!(derive("alice", &c).is_none());
    }

    #[test]
    fn non_notification_content_does_not_notify() {
        let c = content(ContentBody::Block(Block {
            identity: "bob".to_string(),
        }));
        assert!(derive("alice", &c).is_none());
    }

    #[test]
    fn empty_content_does_not_notify() {
        assert!(derive("alice", &Content { content_body: None }).is_none());
    }

    #[test]
    fn key_columns_flattens_an_event_key() {
        let cols = KeyColumns::from(&event_key("bob"));
        assert_eq!(cols.collection, 2);
        assert_eq!(cols.identity, "bob");
        assert_eq!(cols.public_key_type, 1);
        assert_eq!(cols.public_key, vec![0xAB, 0xCD]);
        assert_eq!(cols.sequence, 7);
    }

    #[test]
    fn key_columns_defaults_signer_fields_when_unsigned() {
        let mut key = event_key("bob");
        key.signed_by = None;
        let cols = KeyColumns::from(&key);
        assert_eq!(cols.identity, "bob");
        assert_eq!(cols.public_key_type, 0);
        assert!(cols.public_key.is_empty());
    }
}
