//! Shared Valkey pub/sub over GLIDE: one publishing and one subscribing
//! connection per process. GLIDE reconnects and restores subscriptions.

use std::time::Duration;

use glide::{BackoffStrategy, GlideClient, GlideClientConfiguration, GlideError, ProtocolVersion};
use tokio::sync::broadcast;

pub use glide::{AsyncTypedCommands, PubSubCommands, PubSubMessage};

/// Messages buffered for slow consumers before they see `Lagged`.
const MESSAGE_BUFFER: usize = 4096;

pub struct Clients {
    pub publisher: GlideClient,
    /// Subscribe here; messages arrive through [`Clients::messages`].
    pub subscriber: GlideClient,
    messages: broadcast::Sender<PubSubMessage>,
}

impl Clients {
    /// `url` is `redis://` or `rediss://`. Connects on first use and
    /// retries forever, so a server that is down at startup is not fatal.
    pub async fn connect(url: &str) -> Result<Self, GlideError> {
        let publisher = GlideClient::connect(config(url)?).await?;
        let subscriber = GlideClient::connect(config(url)?.enable_pubsub()).await?;
        let (messages, _) = broadcast::channel(MESSAGE_BUFFER);
        tokio::spawn(receive(subscriber.clone(), messages.clone()));
        Ok(Self {
            publisher,
            subscriber,
            messages,
        })
    }

    /// Every message on every channel the subscriber follows.
    pub fn messages(&self) -> broadcast::Receiver<PubSubMessage> {
        self.messages.subscribe()
    }
}

fn config(url: &str) -> Result<GlideClientConfiguration, GlideError> {
    Ok(GlideClientConfiguration::from_url(url)?
        // The URL parser defaults to RESP2, which carries no pub/sub pushes.
        .protocol(ProtocolVersion::RESP3)
        .request_timeout(Duration::from_secs(2))
        .lazy_connect(true)
        .reconnect_strategy(BackoffStrategy {
            num_of_retries: 6,
            factor: 100,
            exponent_base: 2,
            jitter_percent: Some(20),
        }))
}

// GLIDE's queue has one consumer, so a single task fans out to everyone.
async fn receive(subscriber: GlideClient, messages: broadcast::Sender<PubSubMessage>) {
    loop {
        match subscriber.get_pubsub_message().await {
            Ok(message) => {
                let _ = messages.send(message);
            }
            Err(e) => {
                tracing::error!(error = %e, "valkey pubsub receive error");
                return;
            }
        }
    }
}
