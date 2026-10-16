//! Live heads over Valkey sharded pub/sub, one channel per identity. A process
//! only subscribes to identities with a `SubscribeHeads` stream open on it.

use std::collections::HashMap;
use std::hash::{BuildHasher, RandomState};
use std::sync::{Arc, OnceLock, PoisonError, RwLock};
use std::time::Duration;

use fred::clients::SubscriberClient;
use fred::prelude::*;
use fred::types::Message as PubsubMessage;
use polycentric_common::models::heads::Heads;
use polycentric_common::models::protos_v2::{EventKey, ListHeadsResponse};
use prost::Message;
use sea_orm::DatabaseConnection;
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::{Mutex, watch};
use tokio::task::JoinSet;
use tonic::Status;

use crate::service::events::rpc::list_heads::heads;

/// A pool of locks, each identity always using the same one (by hash). Held
/// around SSUBSCRIBE/SUNSUBSCRIBE so a release can't undo a newer subscribe.
const SUBSCRIBE_LOCKS: usize = 64;
/// Concurrent heads reads when refreshing.
const REFRESH_CONCURRENCY: usize = 16;

static PUBSUB: OnceLock<HeadsPubSub> = OnceLock::new();

/// Starts the pub/sub. Connects in the background, retrying forever.
pub fn init(
    url: &str,
    server_name: &str,
    db: DatabaseConnection,
) -> Result<(), Error> {
    let mut builder = Builder::from_config(Config::from_url(url)?);
    builder
        .with_performance_config(|perf| {
            perf.broadcast_channel_capacity = 4096;
            perf.default_command_timeout = Duration::from_secs(2);
        })
        .set_policy(ReconnectPolicy::new_exponential(0, 100, 5_000, 2));
    let publisher = builder.build()?;
    let subscriber = builder.build_subscriber_client()?;
    publisher.connect();
    subscriber.connect();

    let pubsub = PUBSUB.get_or_init(|| HeadsPubSub {
        channel_prefix: format!("heads:{server_name}:"),
        db,
        publisher,
        subscriber,
        watches: RwLock::default(),
        subscribe_locks: std::array::from_fn(|_| Mutex::new(())),
        hasher: RandomState::new(),
    });
    tokio::spawn(pubsub.receive());
    tokio::spawn(pubsub.resubscribe_on_reconnect());
    Ok(())
}

/// The pub/sub, or `None` when `HARBOR_VALKEY_URL` isn't set.
pub fn get() -> Option<&'static HeadsPubSub> {
    PUBSUB.get()
}

pub struct HeadsPubSub {
    /// `heads:{server name}:`, so deployments can share a Valkey.
    channel_prefix: String,
    db: DatabaseConnection,
    publisher: Client,
    subscriber: SubscriberClient,
    watches: RwLock<HashMap<Arc<str>, watch::Sender<Heads>>>,
    subscribe_locks: [Mutex<()>; SUBSCRIBE_LOCKS],
    hasher: RandomState,
}

impl HeadsPubSub {
    /// Announces that `identity` stored the events with `keys`.
    pub async fn publish(&self, identity: &str, keys: Vec<EventKey>) {
        let payload = Heads::from_iter(keys).to_response().encode_to_vec();
        if let Err(e) = self
            .publisher
            .spublish::<(), _, _>(self.channel(identity), payload)
            .await
        {
            tracing::warn!(error = %e, "heads publish error");
        }
    }

    /// Follows the heads of `identity`, starting from those in the database.
    pub async fn subscribe(
        &'static self,
        identity: &str,
    ) -> Result<Subscription, Status> {
        let lock = self.subscribe_lock(identity).lock().await;
        let existing =
            self.read_watches().get(identity).map(|tx| tx.subscribe());
        let rx = match existing {
            Some(rx) => rx,
            None => {
                self.subscriber
                    .ssubscribe(self.channel(identity))
                    .await
                    .map_err(|e| {
                        tracing::warn!(error = %e, "heads subscribe error");
                        Status::unavailable("live sync unavailable")
                    })?;
                let (tx, rx) = watch::channel(Heads::default());
                self.write_watches().insert(identity.into(), tx);
                rx
            }
        };
        drop(lock);
        let subscription = Subscription {
            pubsub: self,
            identity: identity.into(),
            rx: Some(rx),
        };

        // Subscribed before reading, so no event falls between the two.
        let current = heads(&self.db, identity).await?;
        self.merge(identity, current.heads);
        Ok(subscription)
    }

    /// Drops the channel of `identity` once nothing follows it.
    async fn release(&self, identity: &str) {
        let _lock = self.subscribe_lock(identity).lock().await;
        let unused = {
            let mut watches = self.write_watches();
            match watches.get(identity) {
                Some(tx) if tx.receiver_count() == 0 => {
                    watches.remove(identity);
                    true
                }
                _ => false,
            }
        };
        if unused
            && let Err(e) =
                self.subscriber.sunsubscribe(self.channel(identity)).await
        {
            tracing::warn!(error = %e, "heads unsubscribe error");
        }
    }

    async fn receive(&'static self) {
        let mut messages = self.subscriber.message_rx();
        loop {
            match messages.recv().await {
                Ok(message) => self.on_message(message),
                Err(RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "heads pubsub lagged");
                    self.refresh().await;
                }
                Err(RecvError::Closed) => return,
            }
        }
    }

    fn on_message(&self, message: PubsubMessage) {
        let Some(identity) =
            channel_identity(&message.channel, &self.channel_prefix)
        else {
            return;
        };
        let bytes = match message.value {
            Value::Bytes(bytes) => bytes,
            Value::String(string) => string.into_inner(),
            _ => return,
        };
        match ListHeadsResponse::decode(bytes) {
            Ok(response) => self.merge(identity, response.heads),
            Err(e) => tracing::warn!(error = %e, "heads message decode error"),
        }
    }

    async fn resubscribe_on_reconnect(&'static self) {
        let mut reconnects = self.subscriber.reconnect_rx();
        loop {
            match reconnects.recv().await {
                Ok(_) | Err(RecvError::Lagged(_)) => {}
                Err(RecvError::Closed) => return,
            }
            if let Err(e) = self.subscriber.resubscribe_all().await {
                tracing::warn!(error = %e, "heads resubscribe error");
            }
            self.refresh().await;
        }
    }

    /// Re-reads the heads of every followed identity.
    async fn refresh(&'static self) {
        let identities: Vec<Arc<str>> =
            self.read_watches().keys().cloned().collect();
        let mut reads = JoinSet::new();
        for identity in identities {
            if reads.len() >= REFRESH_CONCURRENCY {
                reads.join_next().await;
            }
            reads.spawn(async move {
                match heads(&self.db, &identity).await {
                    Ok(current) => self.merge(&identity, current.heads),
                    Err(e) => tracing::warn!(error = %e, "heads refresh error"),
                }
            });
        }
        reads.join_all().await;
    }

    fn merge(&self, identity: &str, keys: Vec<EventKey>) {
        if let Some(tx) = self.read_watches().get(identity) {
            tx.send_if_modified(|heads| heads.merge(keys));
        }
    }

    fn channel(&self, identity: &str) -> String {
        channel_name(identity, &self.channel_prefix)
    }

    fn subscribe_lock(&self, identity: &str) -> &Mutex<()> {
        let index = self.hasher.hash_one(identity) as usize % SUBSCRIBE_LOCKS;
        &self.subscribe_locks[index]
    }

    fn read_watches(
        &self,
    ) -> std::sync::RwLockReadGuard<'_, HashMap<Arc<str>, watch::Sender<Heads>>>
    {
        self.watches.read().unwrap_or_else(PoisonError::into_inner)
    }

    fn write_watches(
        &self,
    ) -> std::sync::RwLockWriteGuard<'_, HashMap<Arc<str>, watch::Sender<Heads>>>
    {
        self.watches.write().unwrap_or_else(PoisonError::into_inner)
    }
}

/// `heads:{server}:{identity}`, the braces making the identity the hash tag.
fn channel_name(identity: &str, prefix: &str) -> String {
    format!("{prefix}{{{identity}}}")
}

/// The identity of a channel named by [`channel_name`] with `prefix`.
fn channel_identity<'a>(channel: &'a str, prefix: &str) -> Option<&'a str> {
    channel
        .strip_prefix(prefix)?
        .strip_prefix('{')?
        .strip_suffix('}')
}

/// Follows one identity's heads. Dropping it releases the unused channel.
pub struct Subscription {
    pubsub: &'static HeadsPubSub,
    identity: Arc<str>,
    /// Only `None` while dropping.
    rx: Option<watch::Receiver<Heads>>,
}

impl Subscription {
    pub fn heads(&mut self) -> &mut watch::Receiver<Heads> {
        self.rx.as_mut().expect("receiver taken only in drop")
    }
}

impl Drop for Subscription {
    fn drop(&mut self) {
        // Release after the receiver is gone, or it still counts.
        drop(self.rx.take());
        let pubsub = self.pubsub;
        let identity = self.identity.clone();
        tokio::spawn(async move { pubsub.release(&identity).await });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_names_hash_on_the_identity() {
        let prefix = "heads:https://srv.example:";
        let channel = channel_name("ab12", prefix);
        assert_eq!(channel, "heads:https://srv.example:{ab12}");
        assert_eq!(channel_identity(&channel, prefix), Some("ab12"));
        assert_eq!(
            channel_identity("heads:https://other:{ab12}", prefix),
            None,
            "another deployment's channel"
        );
    }
}
