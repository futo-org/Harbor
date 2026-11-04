//! Building, signing and committing events.

use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{
    Content, ContentDigest, Event, EventBundle, EventKey, PublicKey, SerializedContent,
    SignedEvent, content::ContentBody,
};
use polycentric_common::models::traits::Serializable;
use prost::Message;

use crate::lock::LockRecover;
use crate::sdk::client::{Client, content_digest_of_bytes};
use crate::sdk::error::{SdkError, SdkResult};
use crate::sdk::events::ClientEvent;
use crate::sdk::keys::{KeyPair, keys_equal};
use crate::time::now_millis;

/// A signed event and its serialized content, not yet stored. Only rs-core
/// holds the bytes; hosts see it through [`PreparedEvent::bundle`].
#[derive(Clone, Debug)]
pub struct PreparedEvent {
    pub signed: SignedEvent,
    pub content: Vec<u8>,
}

impl PreparedEvent {
    pub fn bundle(&self) -> EventBundle {
        bundle_of(self.signed.clone(), self.content.clone())
    }
}

pub(crate) fn bundle_of(signed: SignedEvent, content: Vec<u8>) -> EventBundle {
    EventBundle {
        signed_event: Some(signed),
        serialized_content: Some(SerializedContent {
            content_bytes: content,
        }),
        ..Default::default()
    }
}

impl Client {
    /// Encode `content` (once: these bytes are what's hashed and signed),
    /// build and sign its event in `collection` as the active login,
    /// without storing anything. Commit it with [`Client::commit`].
    pub async fn prepare(&self, content: &Content, collection: i32) -> SdkResult<PreparedEvent> {
        let bytes = content.encode_to_vec();
        let event = self.build_event(&bytes, collection, None, None).await?;
        let signed = self.sign_event(&event, None)?;
        Ok(PreparedEvent {
            signed,
            content: bytes,
        })
    }

    /// Store a prepared event. Fails with [`SdkError::AlreadyExists`] if
    /// its sequence was taken since it was prepared; prepare it again then.
    pub async fn commit(&self, prepared: &PreparedEvent) -> SdkResult<EventBundle> {
        self.commit_event(prepared.signed.clone(), Some(prepared.content.clone()))
            .await?;
        Ok(prepared.bundle())
    }

    /// Encode, build, sign and commit `content` as the active login.
    pub async fn publish_content(
        &self,
        content: &Content,
        collection: i32,
    ) -> SdkResult<EventBundle> {
        let bytes = content.encode_to_vec();
        let signed = self.publish(&bytes, collection).await?;
        Ok(bundle_of(signed, bytes))
    }

    /// Store serialized `Content` locally so events referencing it can be
    /// built. Content is always handled as the caller's bytes: encoding is
    /// not deterministic (protobuf maps), so re-encoding could change its
    /// digest.
    pub async fn save_content(&self, content: &[u8]) -> SdkResult<ContentDigest> {
        Content::decode(content)?;
        let digest = content_digest_of_bytes(content);
        let bytes = content.to_vec();
        self.inner
            .storage
            .put_contents(vec![(digest.clone(), bytes.clone())])
            .await?;
        let _ = self.engine().lock_recover().copy_content(&digest, bytes);
        Ok(digest)
    }

    /// Bring the protocol engine up to date with storage for `identity`,
    /// in case another client sharing the storage (another browser tab)
    /// committed since. A no-op when nothing is behind.
    pub(crate) async fn refresh_from_storage(&self, identity: &str) -> SdkResult<()> {
        let stored = self.inner.storage.heads(identity.to_string()).await?;
        let local = self.local_heads(identity);
        for head in stored {
            let Some(signer) = head.signed_by.clone() else {
                continue;
            };
            let local_seq = local
                .iter()
                .find(|l| {
                    l.collection == head.collection
                        && l.signed_by.as_ref().is_some_and(|s| keys_equal(s, &signer))
                })
                .map(|l| l.sequence)
                .unwrap_or(0);
            if local_seq >= head.sequence {
                continue;
            }
            let events = self
                .inner
                .storage
                .stream_events(identity.to_string(), head.collection, signer, local_seq)
                .await?;
            let mut contents = Vec::new();
            for event in &events {
                if let Ok(decoded) = Event::decode(event.event_bytes.as_slice())
                    && let Some(digest) = decoded.content_digest
                    && let Some(bytes) = self.inner.storage.get_content(digest.clone()).await?
                {
                    contents.push((digest, bytes));
                }
            }
            self.absorb_events(events, contents);
        }
        Ok(())
    }

    /// Build an unsigned event for serialized `content` in `collection`, by
    /// default for the active identity and key.
    pub async fn build_event(
        &self,
        content: &[u8],
        collection: i32,
        identity: Option<String>,
        signer: Option<PublicKey>,
    ) -> SdkResult<Event> {
        let login = self.active_login();
        let identity = identity
            .or_else(|| login.as_ref().map(|l| l.id.identity.clone()))
            .ok_or(SdkError::NoActiveIdentity)?;
        let signer = signer
            .or_else(|| login.as_ref().map(|l| l.key_pair.public_key()))
            .ok_or(SdkError::NoActiveKeyPair)?;

        self.refresh_from_storage(&identity).await?;
        self.build_event_local(content, collection, Some(identity), Some(signer))
    }

    /// [`Client::build_event`] from what the protocol engine holds, without
    /// first catching up on commits made by other clients sharing the
    /// storage. Fine when this client is storage's only writer.
    pub fn build_event_local(
        &self,
        content: &[u8],
        collection: i32,
        identity: Option<String>,
        signer: Option<PublicKey>,
    ) -> SdkResult<Event> {
        let login = self.active_login();
        let identity = identity
            .or_else(|| login.as_ref().map(|l| l.id.identity.clone()))
            .ok_or(SdkError::NoActiveIdentity)?;
        let signer = signer
            .or_else(|| login.as_ref().map(|l| l.key_pair.public_key()))
            .ok_or(SdkError::NoActiveKeyPair)?;

        let core = self.engine().lock_recover();
        let sequence = core.next_sequence(&identity, collection);

        // identity_sequence must reference an identity event by this signer.
        let identity_sequence = if collection == collections::IDENTITY {
            sequence
        } else {
            core.get_identity_sequence(&identity, &signer)
                .ok_or_else(|| {
                    SdkError::Unauthorized(
                        "signing key has no identity event for this identity (broken pairing?)"
                            .into(),
                    )
                })?
        };

        let decoded = Content::decode(content)?;
        let identity_content = match (decoded.content_body, collection) {
            (Some(ContentBody::Identity(doc)), collections::IDENTITY) => Some(doc),
            _ => None,
        };
        let vector_clock = core.build_vector_clock(
            &identity,
            collection,
            identity_sequence,
            &signer,
            sequence,
            identity_content,
        )?;

        Ok(Event {
            key: Some(EventKey {
                collection,
                identity: identity.clone(),
                signed_by: Some(signer),
                sequence,
            }),
            identity_sequence,
            vector_clock: Some(vector_clock),
            previous_signature: core.previous_signature(&identity, collection),
            previous_root: core.previous_root(&identity, collection),
            content_digest: Some(content_digest_of_bytes(content)),
            created_at: now_millis(),
            application: self.inner.application.clone(),
        })
    }

    /// Sign `event` with `key_pair`, by default the active login's.
    pub fn sign_event(&self, event: &Event, key_pair: Option<&KeyPair>) -> SdkResult<SignedEvent> {
        let active;
        let key_pair = match key_pair {
            Some(k) => k,
            None => {
                active = self.active_login().ok_or(SdkError::NoActiveKeyPair)?;
                &active.key_pair
            }
        };
        sign_event_with(event, key_pair)
    }

    /// Persist a signed event (and its serialized content) and copy it into
    /// the protocol engine. Fails with [`SdkError::AlreadyExists`] if
    /// another event already holds its key, rather than forking the stream.
    pub async fn commit_event(
        &self,
        signed_event: SignedEvent,
        content: Option<Vec<u8>>,
    ) -> SdkResult<()> {
        // Verify before anything is written.
        let verified = SignedEvent::from_bytes(&signed_event.encode_to_vec())
            .map_err(|e| SdkError::Crypto(format!("invalid signed event: {e:?}")))?;
        let event = Event::decode(verified.event_bytes.as_slice())?;

        let content_entry = match (&content, &event.content_digest) {
            (Some(bytes), Some(digest)) => {
                digest
                    .verify_against(bytes)
                    .map_err(|e| SdkError::InvalidInput(format!("content: {e}")))?;
                Some((digest.clone(), bytes.clone()))
            }
            _ => None,
        };

        if let Some(entry) = &content_entry {
            self.inner.storage.put_contents(vec![entry.clone()]).await?;
        }
        self.inner
            .storage
            .insert_own_event(verified.clone())
            .await?;

        {
            let mut core = self.engine().lock_recover();
            if let Some((digest, bytes)) = content_entry {
                let _ = core.copy_content(&digest, bytes);
            }
            core.copy_event(verified.clone())?;
        }

        self.emit(ClientEvent::Committed {
            signed_event: verified,
            content,
        });
        Ok(())
    }

    /// Build, sign and commit serialized `content` as the active login.
    /// Retries if another client sharing the storage took the sequence first.
    pub async fn publish(&self, content: &[u8], collection: i32) -> SdkResult<SignedEvent> {
        let mut attempts = 0;
        loop {
            attempts += 1;
            let event = self.build_event(content, collection, None, None).await?;
            let signed = self.sign_event(&event, None)?;
            match self
                .commit_event(signed.clone(), Some(content.to_vec()))
                .await
            {
                Ok(()) => return Ok(signed),
                Err(SdkError::AlreadyExists(_)) if attempts < 3 => continue,
                Err(e) => return Err(e),
            }
        }
    }

    /// Persist each bundle (content first) in order. Fails on the first
    /// malformed bundle or failed write.
    pub async fn save_bundles(&self, bundles: Vec<EventBundle>) -> SdkResult<()> {
        for bundle in bundles {
            let signed = bundle
                .signed_event
                .ok_or_else(|| SdkError::InvalidInput("bundle is missing its event".into()))?;
            let event = Event::decode(signed.event_bytes.as_slice())?;
            if event
                .key
                .as_ref()
                .and_then(|k| k.signed_by.as_ref())
                .is_none()
            {
                return Err(SdkError::InvalidInput("event is missing its key".into()));
            }
            let content_bytes = bundle
                .serialized_content
                .ok_or_else(|| SdkError::InvalidInput("bundle is missing content".into()))?
                .content_bytes;
            let digest = event
                .content_digest
                .ok_or_else(|| SdkError::InvalidInput("event has no content digest".into()))?;
            digest.verify_against(&content_bytes).map_err(|_| {
                SdkError::InvalidInput("content does not match event digest".into())
            })?;
            SignedEvent::from_bytes(&signed.encode_to_vec())
                .map_err(|e| SdkError::Crypto(format!("invalid signed event: {e:?}")))?;

            self.inner
                .storage
                .put_contents(vec![(digest.clone(), content_bytes.clone())])
                .await?;
            self.inner.storage.put_events(vec![signed.clone()]).await?;
            self.absorb_events(vec![signed], vec![(digest, content_bytes)]);
        }
        Ok(())
    }
}

/// Sign `event` with `key_pair` and check the result verifies.
pub fn sign_event_with(event: &Event, key_pair: &KeyPair) -> SdkResult<SignedEvent> {
    let event_bytes = event.encode_to_vec();
    let signed = SignedEvent {
        signature: key_pair.sign(&event_bytes),
        event_bytes,
    };
    SignedEvent::from_bytes(&signed.encode_to_vec())
        .map_err(|e| SdkError::Crypto(format!("event signature invalid: {e:?}")))
}
