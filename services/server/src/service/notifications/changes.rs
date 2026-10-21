//! Feed of "notifications changed" events, shared across server and worker
//! processes over Valkey pub/sub. Without Valkey it stays in-process.

use std::sync::{Arc, OnceLock};
use std::time::Duration;

use common_valkey::{Clients, Message};
use tokio::sync::broadcast;
use tokio::sync::broadcast::error::RecvError;

/// `All` follows a (re)connect or a lag, when changes may have been missed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Change {
    Identity(Arc<str>),
    All,
}

static CHANGES: OnceLock<broadcast::Sender<Change>> = OnceLock::new();
static FEED: OnceLock<Feed> = OnceLock::new();

struct Feed {
    valkey: &'static Clients,
    channel: String,
}

fn sender() -> &'static broadcast::Sender<Change> {
    CHANGES.get_or_init(|| broadcast::channel(1024).0)
}

/// Called once at startup. Without `valkey`, `notify` only reaches this
/// process.
pub fn init(valkey: Option<&'static Clients>, server_name: &str) {
    let Some(valkey) = valkey else { return };
    let feed = FEED.get_or_init(|| Feed {
        valkey,
        channel: channel_name(server_name),
    });
    tokio::spawn(feed.receive());
    tokio::spawn(feed.announce_resubscribes());
}

impl Feed {
    async fn receive(&'static self) {
        while let Err(e) = self.valkey.subscribe(&self.channel).await {
            tracing::warn!(error = %e, "notification feed subscribe error");
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
        let _ = sender().send(Change::All);

        let mut messages = self.valkey.messages();
        loop {
            match messages.recv().await {
                Ok(message) => self.on_message(message),
                Err(RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "notification feed lagged");
                    let _ = sender().send(Change::All);
                }
                Err(RecvError::Closed) => return,
            }
        }
    }

    fn on_message(&self, message: Message) {
        // The subscriber is shared, so other features' channels pass by here.
        if message.get_channel_name() != self.channel {
            return;
        }
        match std::str::from_utf8(message.get_payload_bytes()) {
            Ok(identity) => {
                let _ = sender().send(Change::Identity(identity.into()));
            }
            Err(e) => {
                tracing::warn!(error = %e, "notification feed payload is not an identity")
            }
        }
    }

    async fn announce_resubscribes(&'static self) {
        let mut resubscribed = self.valkey.resubscribed();
        loop {
            match resubscribed.recv().await {
                Ok(()) | Err(RecvError::Lagged(_)) => {
                    let _ = sender().send(Change::All);
                }
                Err(RecvError::Closed) => return,
            }
        }
    }
}

/// Changes from every process. Nothing arrives before `init`.
pub fn subscribe() -> broadcast::Receiver<Change> {
    sender().subscribe()
}

/// Announces that `identity`'s notifications changed.
pub async fn notify(identity: &str) {
    match FEED.get() {
        Some(feed) => {
            if let Err(e) = feed.valkey.publish(&feed.channel, identity).await {
                tracing::warn!(error = %e, "notification feed publish error");
            }
        }
        None => {
            let _ = sender().send(Change::Identity(identity.into()));
        }
    }
}

/// `notifications:{server}`, so deployments can share a Valkey.
fn channel_name(server_name: &str) -> String {
    format!("notifications:{server_name}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn notify_broadcasts_in_process_without_valkey() {
        let mut changes = subscribe();
        notify("bob").await;
        assert_eq!(
            changes.recv().await.unwrap(),
            Change::Identity("bob".into())
        );
    }

    #[test]
    fn channel_is_per_server() {
        assert_eq!(
            channel_name("https://srv.example"),
            "notifications:https://srv.example"
        );
    }
}
