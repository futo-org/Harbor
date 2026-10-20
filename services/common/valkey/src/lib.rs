//! Shared Valkey pub/sub: one publishing and one subscribing connection per
//! process, reconnecting and resubscribing on their own.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use redis::aio::{ConnectionManager, ConnectionManagerConfig};
use redis::{
    AsyncTypedCommands, Client, IntoConnectionInfo, Msg, ProtocolVersion, PushInfo, PushKind,
    RedisResult, ToSingleRedisArg,
};
use tokio::sync::{broadcast, mpsc};

pub use redis::Msg as Message;

/// Messages buffered for slow consumers before they see `Lagged`.
const MESSAGE_BUFFER: usize = 4096;
/// How often a disconnected subscriber is pinged to see if it is back.
const RECONNECT_POLL: Duration = Duration::from_millis(250);

pub struct Clients {
    publisher: ConnectionManager,
    subscriber: ConnectionManager,
    messages: broadcast::Sender<Msg>,
    resubscribed: broadcast::Sender<()>,
}

impl Clients {
    /// `url` is `redis://` or `rediss://`. Connects on first use and
    /// retries with backoff, so a server that is down at startup is not fatal.
    pub fn connect(url: &str) -> RedisResult<Self> {
        let info = url.into_connection_info()?;
        // Pub/sub pushes need RESP3; URLs default to RESP2.
        let settings = info
            .redis_settings()
            .clone()
            .set_protocol(ProtocolVersion::RESP3);
        let client = Client::open(info.set_redis_settings(settings))?;

        let (pushes, push_rx) = mpsc::unbounded_channel::<PushInfo>();
        let publisher = client.get_connection_manager_lazy(config())?;
        let subscriber = client.get_connection_manager_lazy(
            config()
                .set_push_sender(pushes)
                .set_automatic_resubscription(),
        )?;
        let (messages, _) = broadcast::channel(MESSAGE_BUFFER);
        let (resubscribed, _) = broadcast::channel(16);
        tokio::spawn(receive(
            push_rx,
            subscriber.clone(),
            messages.clone(),
            resubscribed.clone(),
        ));
        Ok(Self {
            publisher,
            subscriber,
            messages,
            resubscribed,
        })
    }

    pub async fn publish(
        &self,
        channel: &str,
        payload: impl ToSingleRedisArg + Send + Sync,
    ) -> RedisResult<()> {
        self.publisher.clone().publish(channel, payload).await?;
        Ok(())
    }

    pub async fn subscribe(&self, channel: &str) -> RedisResult<()> {
        self.subscriber.clone().subscribe(channel).await
    }

    pub async fn unsubscribe(&self, channel: &str) -> RedisResult<()> {
        self.subscriber.clone().unsubscribe(channel).await
    }

    /// Every message on every channel the subscriber follows.
    pub fn messages(&self) -> broadcast::Receiver<Msg> {
        self.messages.subscribe()
    }

    /// Fires once the subscriber is back after a dropped connection, with
    /// its channels subscribed again. Messages sent meanwhile were lost.
    pub fn resubscribed(&self) -> broadcast::Receiver<()> {
        self.resubscribed.subscribe()
    }
}

fn config() -> ConnectionManagerConfig {
    ConnectionManagerConfig::new()
        .set_min_delay(Duration::from_millis(100))
        .set_max_delay(Duration::from_secs(5))
        .set_number_of_retries(6)
        .set_connection_timeout(Some(Duration::from_secs(2)))
        .set_response_timeout(Some(Duration::from_secs(2)))
}

async fn receive(
    mut pushes: mpsc::UnboundedReceiver<PushInfo>,
    subscriber: ConnectionManager,
    messages: broadcast::Sender<Msg>,
    resubscribed: broadcast::Sender<()>,
) {
    let reconnecting = Arc::new(AtomicBool::new(false));
    while let Some(push) = pushes.recv().await {
        if push.kind == PushKind::Disconnection {
            tracing::warn!("valkey subscriber disconnected");
            if !reconnecting.swap(true, Ordering::AcqRel) {
                tokio::spawn(announce_reconnect(
                    subscriber.clone(),
                    resubscribed.clone(),
                    reconnecting.clone(),
                ));
            }
        } else if let Some(message) = Msg::from_push_info(push) {
            let _ = messages.send(message);
        }
    }
}

// The manager reconnects and resubscribes by itself but doesn't say when, so
// poll until a command gets through.
async fn announce_reconnect(
    mut subscriber: ConnectionManager,
    resubscribed: broadcast::Sender<()>,
    reconnecting: Arc<AtomicBool>,
) {
    loop {
        tokio::time::sleep(RECONNECT_POLL).await;
        if subscriber.ping().await.is_ok() {
            break;
        }
    }
    reconnecting.store(false, Ordering::Release);
    tracing::info!("valkey subscriber reconnected");
    let _ = resubscribed.send(());
}
