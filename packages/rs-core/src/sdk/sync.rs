//! Syncing the active identity with its servers, and blobs.

use std::collections::BTreeMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use polycentric_common::models::protos_v2::{
    Blob, Content, ContentDigest, ContentDigestType, Event, EventBundle, EventKey, ImageSet,
    ListHeadsResponse, PutEventsResponse, SignedEvent, UploadBlobRequest, content::ContentBody,
};
use polycentric_common::models::traits::Serializable;
use prost::Message;

use crate::lock::LockRecover;
use crate::query::event::ListEventsArgs;
use crate::query::event::key::EventKey as FfiEventKey;
use crate::query::{ByteObserver, ByteResult};
use crate::rx::subscription::Subscription;
use crate::sdk::client::{Client, content_digest_of_bytes};
use crate::sdk::error::{SdkError, SdkResult};
use crate::sdk::events::ClientEvent;
use crate::sdk::keys::keys_equal;
use crate::sdk::types::{ServerPushResult, SyncStrategy};

impl Client {
    /// Sync the active identity's events with its servers. Returns the
    /// number of new events pulled. Fails only if the pull fails; each
    /// server's push outcome is reported as [`ClientEvent::PushResults`].
    pub async fn sync(&self, strategy: SyncStrategy) -> SdkResult<u32> {
        let Some(identity) = self.active_identity() else {
            return Ok(0);
        };
        let servers = self.servers();

        let pull = async {
            match strategy.pull() {
                Some(partial) => self.pull(&identity, partial, None).await,
                None => Ok(0),
            }
        };
        let push = async {
            match strategy.push() {
                Some(partial) => {
                    let pushes = servers
                        .iter()
                        .map(|server| self.push_to(&identity, server, partial));
                    Some(futures::future::join_all(pushes).await)
                }
                None => None,
            }
        };
        let (pulled, pushed) = futures::join!(pull, push);

        if let Some(results) = pushed {
            self.emit(ClientEvent::PushResults(results));
        }
        pulled
    }

    async fn push_to(&self, identity: &str, server: &str, partial: bool) -> ServerPushResult {
        let mut result = ServerPushResult {
            identity: identity.to_string(),
            server: server.to_string(),
            event_issues: Vec::new(),
            error: None,
        };
        match self
            .inner
            .core
            .push_local_events(identity.to_string(), server.to_string(), partial)
            .await
        {
            Ok(None) => {}
            Ok(Some(pushed)) => {
                for issues in &pushed.event_issues {
                    crate::logging::log_warn(|| format!("issues from event push: {issues:?}"));
                }
                result.event_issues = pushed.event_issues;
                if let Ok(response) = PutEventsResponse::decode(pushed.response.as_slice()) {
                    for blob in response.requested_blobs {
                        let Some(digest) = blob.digest.clone() else {
                            continue;
                        };
                        if let Ok(Some(body)) = self.inner.storage.get_blob(digest).await {
                            self.upload_blob(&blob, body, Some(vec![server.to_string()]))
                                .await;
                        }
                    }
                }
            }
            Err(e) => {
                crate::logging::log_warn(|| format!("sync failed for {server}: {e}"));
                result.error = Some(e.to_string());
            }
        }
        result
    }

    /// Pull `identity`'s events and store the new ones. A partial pull
    /// skips events at or before the stored heads, or `after` when given.
    pub(crate) async fn pull(
        &self,
        identity: &str,
        partial: bool,
        after: Option<Vec<EventKey>>,
    ) -> SdkResult<u32> {
        let had_after = after.is_some();
        let heads = match after {
            Some(after) => after,
            None if partial => self.inner.storage.heads(identity.to_string()).await?,
            None => Vec::new(),
        };
        let heads: Vec<FfiEventKey> = heads
            .into_iter()
            .filter_map(FfiEventKey::from_proto)
            .collect();

        let bundles = self
            .list_events(
                ListEventsArgs {
                    size: None,
                    identity: identity.to_string(),
                    collection: None,
                    signed_by: None,
                    sequence_gt: None,
                    sequence_lt: None,
                    heads: (!heads.is_empty()).then_some(heads),
                },
                None,
                None,
            )
            .await?;

        let mut blobs: BTreeMap<String, Blob> = BTreeMap::new();
        let mut new_count = 0;
        let received = bundles.len();
        for bundle in bundles {
            match self.absorb_pulled(bundle, &mut blobs).await {
                Ok(true) => new_count += 1,
                Ok(false) => {}
                Err(e) => crate::logging::log_warn(|| format!("pull: dropping event: {e}")),
            }
        }

        // Keep our own blobs on every device.
        self.pull_blobs(blobs.into_values().collect()).await;

        if new_count > 0 || (had_after && received > 0) {
            self.emit(ClientEvent::Pulled {
                identity: identity.to_string(),
            });
        }
        Ok(new_count)
    }

    /// Verify and store one pulled bundle. Returns whether its event was
    /// new. Content is stored (and its blobs collected) even for known
    /// events, in case an earlier pull stored the event without it.
    async fn absorb_pulled(
        &self,
        bundle: EventBundle,
        blobs: &mut BTreeMap<String, Blob>,
    ) -> SdkResult<bool> {
        let Some(signed) = bundle.signed_event else {
            return Ok(false);
        };
        let signed = SignedEvent::from_bytes(&signed.encode_to_vec())
            .map_err(|e| SdkError::Crypto(format!("invalid signature: {e:?}")))?;
        let event = Event::decode(signed.event_bytes.as_slice())?;
        if event
            .key
            .as_ref()
            .and_then(|k| k.signed_by.as_ref())
            .is_none()
        {
            return Ok(false);
        }

        let mut contents = Vec::new();
        if let (Some(serialized), Some(digest)) = (bundle.serialized_content, &event.content_digest)
            && digest.verify_against(&serialized.content_bytes).is_ok()
        {
            if let Ok(content) = Content::decode(serialized.content_bytes.as_slice()) {
                for blob in collect_blobs(&content) {
                    if let Some(d) = &blob.digest {
                        blobs.insert(d.to_id(), blob);
                    }
                }
            }
            contents.push((digest.clone(), serialized.content_bytes));
        }
        if !contents.is_empty() {
            self.inner.storage.put_contents(contents.clone()).await?;
        }
        let inserted = self
            .inner
            .storage
            .put_events(vec![signed.clone()])
            .await?
            .first()
            .copied()
            .unwrap_or(false);
        self.absorb_events(vec![signed], contents);
        Ok(inserted)
    }

    /// Download any of `blobs` not already stored locally.
    pub async fn pull_blobs(&self, blobs: Vec<Blob>) {
        let fetches = blobs
            .into_iter()
            .filter_map(|b| b.digest)
            .map(|digest| async move {
                match self.inner.storage.has_blob(digest.clone()).await {
                    Ok(true) => return,
                    Ok(false) => {}
                    Err(e) => {
                        crate::logging::log_warn(|| format!("pull_blobs: {e}"));
                        return;
                    }
                }
                if let Some(bytes) = self.fetch_blob_bytes(&digest).await
                    && let Err(e) = self.inner.storage.put_blob(digest, bytes).await
                {
                    crate::logging::log_warn(|| format!("pull_blobs: {e}"));
                }
            });
        futures::future::join_all(fetches).await;
    }

    // ── Blobs ───────────────────────────────────────────────────────

    /// The blob URL on each configured server, in order.
    pub fn blob_urls(&self, digest: &ContentDigest) -> Vec<String> {
        blob_urls(&self.servers(), digest)
    }

    /// `image_url` proxied through each configured server, in order.
    pub fn image_proxy_urls(&self, image_url: &str) -> Vec<String> {
        image_proxy_urls(&self.servers(), image_url)
    }

    /// Hash `bytes`, store them locally, and return the matching `Blob`.
    /// Doesn't upload.
    pub async fn commit_blob(&self, bytes: Vec<u8>, mime_type: &str) -> SdkResult<Blob> {
        let digest = content_digest_of_bytes(&bytes);
        let size = bytes.len() as i64;
        self.inner.storage.put_blob(digest.clone(), bytes).await?;
        Ok(Blob {
            digest: Some(digest),
            mime_type: mime_type.to_string(),
            size,
        })
    }

    /// Store a blob body under `digest`, after checking it matches.
    pub async fn put_blob(&self, digest: ContentDigest, bytes: Vec<u8>) -> SdkResult<()> {
        if digest.r#type != ContentDigestType::Sha256 as i32 {
            return Err(SdkError::InvalidInput("unsupported digest type".into()));
        }
        digest
            .verify_against(&bytes)
            .map_err(|e| SdkError::InvalidInput(format!("blob: {e}")))?;
        self.inner.storage.put_blob(digest, bytes).await
    }

    pub async fn get_blob(&self, digest: ContentDigest) -> SdkResult<Option<Vec<u8>>> {
        self.inner.storage.get_blob(digest).await
    }

    pub async fn has_blob(&self, digest: ContentDigest) -> SdkResult<bool> {
        self.inner.storage.has_blob(digest).await
    }

    pub async fn delete_blob(&self, digest: ContentDigest) -> SdkResult<bool> {
        self.inner.storage.delete_blob(digest).await
    }

    /// Download a blob body from the first server that has it, checking it
    /// against `digest`.
    pub async fn fetch_blob_bytes(&self, digest: &ContentDigest) -> Option<Vec<u8>> {
        for url in self.blob_urls(digest) {
            match crate::sdk::http::get(&url, None).await {
                Ok(Some(bytes)) if digest.verify_against(&bytes).is_ok() => return Some(bytes),
                Ok(_) => {}
                Err(e) => crate::logging::log_debug(|| format!("blob fetch: {e}")),
            }
        }
        None
    }

    /// Upload a blob body to `servers` (default: all configured). Failures
    /// are logged, not returned.
    pub async fn upload_blob(&self, blob: &Blob, body: Vec<u8>, servers: Option<Vec<String>>) {
        let servers = servers.unwrap_or_else(|| self.servers());
        let request = UploadBlobRequest {
            blob: Some(blob.clone()),
            body,
        }
        .encode_to_vec();
        let uploads = servers.into_iter().map(|server| {
            let request = request.clone();
            async move {
                if let Err(e) = self.inner.core.upload_blob(server.clone(), request).await {
                    crate::logging::log_warn(|| format!("upload_blob failed for {server}: {e}"));
                }
            }
        });
        futures::future::join_all(uploads).await;
    }

    // ── Live sync ───────────────────────────────────────────────────

    /// Pull the active identity's events as its other devices publish
    /// them, following login changes, until [`Client::stop_live_sync`].
    pub fn start_live_sync(&self) {
        let mut slot = self.inner.live_sync.lock_recover();
        if slot.is_some() {
            return;
        }
        let weak = Arc::downgrade(&self.inner);
        let listener = self.add_listener(Arc::new(move |event| {
            if let ClientEvent::LoginChanged(_) = event
                && let Some(inner) = weak.upgrade()
            {
                let client = Client { inner };
                client.resubscribe_heads();
            }
        }));
        *slot = Some(LiveSync {
            listener,
            subscription: None,
        });
        drop(slot);
        self.resubscribe_heads();
    }

    pub fn stop_live_sync(&self) {
        if let Some(live) = self.inner.live_sync.lock_recover().take() {
            self.remove_listener(live.listener);
            if let Some(sub) = live.subscription {
                sub.unsubscribe();
            }
        }
    }

    fn resubscribe_heads(&self) {
        let mut slot = self.inner.live_sync.lock_recover();
        let Some(live) = slot.as_mut() else {
            return;
        };
        if let Some(old) = live.subscription.take() {
            old.unsubscribe();
        }
        let Some(identity) = self.active_identity() else {
            return;
        };
        let observable = self.inner.core.fetch_query(
            Some(vec!["heads".to_string(), identity.clone()]),
            crate::api::Query::SubscribeHeads(crate::query::heads::SubscribeHeadsArgs {}),
            None,
        );
        let observer = Arc::new(HeadsObserver {
            client: Arc::downgrade(&self.inner),
            identity,
            pulling: Arc::new(AtomicBool::new(false)),
            again: Arc::new(AtomicBool::new(false)),
        });
        live.subscription = Some(observable.subscribe(observer));
    }

    /// Whether any of `remote` is ahead of what's held locally.
    fn is_behind(&self, identity: &str, remote: &[EventKey]) -> bool {
        let local = self.local_heads(identity);
        remote.iter().any(|head| {
            let local_seq = local
                .iter()
                .find(|l| {
                    l.collection == head.collection
                        && match (&l.signed_by, &head.signed_by) {
                            (Some(a), Some(b)) => keys_equal(a, b),
                            _ => false,
                        }
                })
                .map(|l| l.sequence);
            local_seq.is_none_or(|seq| seq < head.sequence)
        })
    }
}

pub(crate) struct LiveSync {
    listener: u64,
    subscription: Option<Arc<Subscription>>,
}

/// Pulls whenever the subscribed identity's heads move past ours. One pull
/// at a time, plus one more if heads arrive during it.
struct HeadsObserver {
    client: std::sync::Weak<crate::sdk::client::Inner>,
    identity: String,
    pulling: Arc<AtomicBool>,
    again: Arc<AtomicBool>,
}

impl ByteObserver for HeadsObserver {
    fn next(&self, result: ByteResult) {
        let Some(data) = result.data else {
            return;
        };
        let Some(inner) = self.client.upgrade() else {
            return;
        };
        let client = Client { inner };
        let Ok(remote) = ListHeadsResponse::decode(data.as_slice()) else {
            return;
        };
        if !client.is_behind(&self.identity, &remote.heads) {
            return;
        }
        if self.pulling.swap(true, Ordering::AcqRel) {
            self.again.store(true, Ordering::Release);
            return;
        }
        let identity = self.identity.clone();
        let pulling = self.pulling.clone();
        let again = self.again.clone();
        crate::query::client::spawn(async move {
            loop {
                again.store(false, Ordering::Release);
                if client.active_identity().as_deref() != Some(identity.as_str()) {
                    break;
                }
                let local = client.local_heads(&identity);
                if let Err(e) = client.pull(&identity, true, Some(local)).await {
                    crate::logging::log_warn(|| format!("live sync pull failed: {e}"));
                }
                if !again.load(Ordering::Acquire) {
                    break;
                }
            }
            pulling.store(false, Ordering::Release);
        });
    }

    // The engine reconnects by itself.
    fn error(&self, _message: String) {}
    fn complete(&self) {}
}

/// Blobs referenced by a post's images or a profile's avatar and banner.
/// The blob URL on each of `servers`, in order.
pub fn blob_urls(servers: &[String], digest: &ContentDigest) -> Vec<String> {
    let key = digest.to_id();
    servers
        .iter()
        .map(|server| format!("{server}/blob/{key}"))
        .collect()
}

/// `image_url` proxied through each of `servers`, in order.
pub fn image_proxy_urls(servers: &[String], image_url: &str) -> Vec<String> {
    let q = percent_encode_component(image_url);
    servers
        .iter()
        .map(|server| format!("{server}/image_proxy?url={q}"))
        .collect()
}

pub fn collect_blobs(content: &Content) -> Vec<Blob> {
    fn push_set(out: &mut Vec<Blob>, set: Option<&ImageSet>) {
        if let Some(set) = set {
            out.extend(set.images.iter().filter_map(|i| i.blob.clone()));
        }
    }
    let mut out = Vec::new();
    match &content.content_body {
        Some(ContentBody::Post(post)) => {
            for set in &post.images {
                push_set(&mut out, Some(set));
            }
        }
        Some(ContentBody::ProfileUpdate(update)) => {
            push_set(&mut out, update.avatar.as_ref());
            push_set(&mut out, update.banner.as_ref());
        }
        _ => {}
    }
    out
}

/// `encodeURIComponent`.
pub(crate) fn percent_encode_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        let c = b as char;
        if c.is_ascii_alphanumeric() || "-_.!~*'()".contains(c) {
            out.push(c);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}
