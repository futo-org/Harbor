//! What the client reports to its host as it works.

use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::{PublicKey, SignedEvent};

use crate::lock::LockRecover;
use crate::sdk::storage::LoginStatus;
use crate::sdk::types::{ClientState, HydrationStatus, InitializationStep, ServerPushResult};

/// The public half of the signed-in login.
#[derive(Clone, Debug, PartialEq)]
pub struct LoginInfo {
    pub identity: String,
    pub public_key: PublicKey,
    pub status: LoginStatus,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ClientEvent {
    StateChanged(ClientState),
    Progress(InitializationStep),
    HydrationStatus(HydrationStatus),
    Error(String),
    /// The signed-in login changed; `None` when signed out.
    LoginChanged(Option<LoginInfo>),
    /// The servers in use changed.
    ServersChanged,
    /// This client committed an event. `content` is serialized `Content`.
    /// An event this client committed (published, or a login/identity
    /// change), with its serialized content.
    Committed {
        signed_event: SignedEvent,
        content: Option<Vec<u8>>,
    },
    /// A pull stored new events for `identity`.
    Pulled {
        identity: String,
    },
    /// One result per server a sync pushed to.
    PushResults(Vec<ServerPushResult>),
}

pub type Listener = Arc<dyn Fn(&ClientEvent) + Send + Sync>;

/// Listeners, called synchronously in registration order.
#[derive(Default)]
pub struct EventBus {
    next_id: Mutex<u64>,
    listeners: Mutex<Vec<(u64, Listener)>>,
}

impl EventBus {
    /// Register `listener`; returns an id for [`EventBus::remove`].
    pub fn add(&self, listener: Listener) -> u64 {
        let mut next = self.next_id.lock_recover();
        *next += 1;
        let id = *next;
        self.listeners.lock_recover().push((id, listener));
        id
    }

    pub fn remove(&self, id: u64) {
        self.listeners.lock_recover().retain(|(i, _)| *i != id);
    }

    pub fn emit(&self, event: ClientEvent) {
        // Call outside the lock so listeners may add or remove listeners.
        let listeners: Vec<Listener> = self
            .listeners
            .lock_recover()
            .iter()
            .map(|(_, l)| l.clone())
            .collect();
        for listener in listeners {
            listener(&event);
        }
    }
}
