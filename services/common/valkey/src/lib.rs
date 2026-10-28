//! Shared Valkey pub/sub: one publishing and one subscribing connection per
//! process, reconnecting and resubscribing on their own.

use std::sync::Arc;
use std::time::Duration;

use redis::aio::{AsyncPushSender, ConnectionManager, ConnectionManagerConfig};
use redis::{
    AsyncTypedCommands, Client, IntoConnectionInfo, Msg, ProtocolVersion, PushInfo, PushKind,
    RedisResult, ToSingleRedisArg,
};
use tokio::sync::{Notify, broadcast};

pub use redis::Msg as Message;

/// Messages buffered for slow consumers before they see `Lagged`.
const MESSAGE_BUFFER: usize = 4096;
/// How often a disconnected subscriber is pinged to see if it is back.
const RECONNECT_POLL: Duration = Duration::from_millis(250);

#[derive(Clone)]
pub struct Clients {
    publisher: ConnectionManager,
    subscriber: ConnectionManager,
    messages: broadcast::Sender<Msg>,
    resubscribed: broadcast::Sender<()>,
}

impl Clients {
    /// `url` is `redis://` or `rediss://`. Connects on first use and
    /// retries with backoff, so a server that is down at startup is not fatal.
    pub async fn connect(url: &str) -> RedisResult<Self> {
        let info = url.into_connection_info()?;
        // Pub/sub pushes need RESP3; URLs default to RESP2.
        let settings = info
            .redis_settings()
            .clone()
            .set_protocol(ProtocolVersion::RESP3);
        let tcp_settings = info
            .tcp_settings()
            .clone()
            // The client should not write partial requests, so coalescing
            // packets doesn't make sense here.
            .set_nodelay(true)
            // Linger causes blocking, and we're using non-blocking I/O.
            .set_linger_time(Duration::ZERO)
            // Keep the connection alive.
            .set_keepalive(
                redis::io::tcp::socket2::TcpKeepalive::new()
                    .with_time(Duration::from_secs(30))
                    .with_interval(Duration::from_secs(2)),
            );
        let client = Client::open(
            info.set_redis_settings(settings)
                .set_tcp_settings(tcp_settings),
        )?;

        let messages = broadcast::channel(MESSAGE_BUFFER).0;
        let resubscribed = broadcast::channel(1).0;
        let disconnect_notify = Arc::new(Notify::new());
        let publisher = client.get_connection_manager_with_config(config()).await?;
        let relay = pusher_relay(messages.clone(), disconnect_notify.clone());
        let subscriber = client
            .get_connection_manager_with_config(
                config()
                    .set_push_sender(relay)
                    .set_automatic_resubscription(),
            )
            .await?;
        tokio::spawn(announce_reconnect(
            disconnect_notify.clone(),
            subscriber.clone(),
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

/// Returns a redis pusher that broadcasts messages.
fn pusher_relay(
    messages: broadcast::Sender<Msg>,
    announce_disconnected: Arc<Notify>,
) -> impl AsyncPushSender {
    move |push: PushInfo| -> Result<(), ()> {
        if push.kind == PushKind::Disconnection {
            tracing::warn!("Valkey subscriber disconnected");
            // Start the task to announce when we're reconnected.
            announce_disconnected.notify_waiters();
        } else if let Some(message) = Msg::from_push_info(push) {
            // From tokio::sync::broadcast::error::SendError docs:
            // > A send operation can only fail if there are no active
            // > receivers, implying that the message could never be received.
            // We don't care if there a no receivers.
            _ = messages.send(message);
        } else {
            // We don't care about other push kinds.
        }
        Ok(())
    }
}

/// The manager reconnects and resubscribes by itself but doesn't say when, so
/// this function waits until the client `disconnect`s and then ping the client
/// until it's connected again, which it broadcasts on `resubscribed`.
async fn announce_reconnect(
    disconnect: Arc<Notify>,
    mut subscriber: ConnectionManager,
    resubscribed: broadcast::Sender<()>,
) {
    loop {
        // Wait until we're notified of a disconnect.
        disconnect.notified().await;

        loop {
            tokio::time::sleep(RECONNECT_POLL).await;
            if subscriber.ping().await.is_ok() {
                break;
            }
        }

        tracing::info!("valkey subscriber reconnected");
        let _ = resubscribed.send(());
    }
}
