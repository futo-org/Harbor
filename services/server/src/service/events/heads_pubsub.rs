//! Live heads over Valkey pub/sub, one channel per identity. A process only
//! subscribes to identities with a `SubscribeHeads` stream open on it.

use std::collections::HashMap;
use std::hash::{BuildHasher, RandomState};
use std::sync::{Arc, OnceLock, PoisonError, RwLock};

use common_valkey::{Clients, Message as PubSubMessage};
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
/// around SUBSCRIBE/UNSUBSCRIBE so a release can't undo a newer subscribe.
const SUBSCRIBE_LOCKS: usize = 64;
/// Concurrent heads reads when refreshing.
const REFRESH_CONCURRENCY: usize = 16;

static PUBSUB: OnceLock<HeadsPubSub> = OnceLock::new();

/// Starts the pub/sub. Called once at server startup.
pub fn init(
    valkey: &'static Clients,
    server_name: &str,
    db: DatabaseConnection,
) {
    let pubsub = PUBSUB.get_or_init(|| HeadsPubSub {
        channel_prefix: format!("heads:{server_name}:"),
        db,
        valkey,
        watches: RwLock::default(),
        subscribe_locks: std::array::from_fn(|_| Mutex::new(())),
        hasher: RandomState::new(),
    });
    tokio::spawn(pubsub.receive());
    tokio::spawn(pubsub.refresh_on_resubscribe());
}

/// The pub/sub, or `None` when `HARBOR_VALKEY_URL` isn't set.
pub fn get() -> Option<&'static HeadsPubSub> {
    PUBSUB.get()
}

pub struct HeadsPubSub {
    /// `heads:{server name}:`, so deployments can share a Valkey.
    channel_prefix: String,
    db: DatabaseConnection,
    valkey: &'static Clients,
    watches: RwLock<HashMap<Arc<str>, watch::Sender<Heads>>>,
    subscribe_locks: [Mutex<()>; SUBSCRIBE_LOCKS],
    hasher: RandomState,
}

impl HeadsPubSub {
    /// Announces that `identity` stored the events with `keys`.
    pub async fn publish(&self, identity: &str, keys: Vec<EventKey>) {
        let payload = Heads::from_iter(keys).to_response().encode_to_vec();
        if let Err(e) =
            self.valkey.publish(&self.channel(identity), payload).await
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
                self.valkey
                    .subscribe(&self.channel(identity))
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
                self.valkey.unsubscribe(&self.channel(identity)).await
        {
            tracing::warn!(error = %e, "heads unsubscribe error");
        }
    }

    async fn receive(&'static self) {
        let mut messages = self.valkey.messages();
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

    fn on_message(&self, message: PubSubMessage) {
        // The subscriber is shared, so other features' channels pass by here.
        let Some(identity) =
            channel_identity(message.get_channel_name(), &self.channel_prefix)
        else {
            return;
        };
        match ListHeadsResponse::decode(message.get_payload_bytes()) {
            Ok(response) => self.merge(identity, response.heads),
            Err(e) => tracing::warn!(error = %e, "heads message decode error"),
        }
    }

    async fn refresh_on_resubscribe(&'static self) {
        let mut resubscribed = self.valkey.resubscribed();
        loop {
            match resubscribed.recv().await {
                Ok(()) | Err(RecvError::Lagged(_)) => self.refresh().await,
                Err(RecvError::Closed) => return,
            }
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

/// `heads:{server}:{identity}`.
fn channel_name(identity: &str, prefix: &str) -> String {
    format!("{prefix}{identity}")
}

/// The identity of a channel named by [`channel_name`] with `prefix`.
fn channel_identity<'a>(channel: &'a str, prefix: &str) -> Option<&'a str> {
    channel.strip_prefix(prefix)
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
    fn channel_names_are_per_server_and_identity() {
        let prefix = "heads:https://srv.example:";
        let channel = channel_name("ab12", prefix);
        assert_eq!(channel, "heads:https://srv.example:ab12");
        assert_eq!(channel_identity(&channel, prefix), Some("ab12"));
        assert_eq!(
            channel_identity("heads:https://other:ab12", prefix),
            None,
            "another deployment's channel"
        );
    }
}
