use std::{env, panic};
use std::mem::take;
use std::process::exit;
use std::time::{SystemTime, Instant};

use ed25519_dalek::{Signer, SigningKey};
use tokio::task::JoinSet;
use sha2::{Digest, Sha256};
use rand::distr::{SampleString, Alphabetic};

use polycentric_common::models::protos_v2::event_sync_service_client::EventSyncServiceClient;
use polycentric_common::models::protos_v2::{Identity, EventBundle, PublicKey, KeyType, SignedEvent, SerializedContent, Event, PutEventsRequest, Content, ContentDigest, EventKey, VectorClock, ContentDigestType, Repost, Delete, Follow, Reaction, Post, PostReply, Labels, ProfileUpdate};
use polycentric_common::models::protos_v2::content::ContentBody;
use polycentric_common::models::collections;
use prost::Message;

const COLLECTION_MAX: i32 = collections::VERIFICATIONS;
const MAX_EVENTS_PER_REQUEST: usize = 100;

#[tokio::main]
async fn main() {
    let mut args = env::args();
    args.next(); // Binary name.
    let Some(address) = args.next() else {
        eprintln!("Missing address argument");
        exit(1);
    };

    if args.len() == 0 {
        eprintln!("No events to generate.");
        exit(1);
    }

    let mut amount = 100;
    let mut clients = 1;
    let mut next = 0; // 1 next is amount, 2 next is clients.
    let to_generate = args.filter_map(|arg| {
        match arg.as_str() {
            _ if next == 1 => {
                amount = arg.parse().expect("invalid amount");
                next = 0;
            },
            _ if next == 2 => {
                clients = arg.parse().expect("invalid amount of clients");
                next = 0;
            },
            "--amount" => next = 1,
            "--clients" => next = 2,
            "post" => return Some(EventKind::Post),
            "delete" => return Some(EventKind::Delete),
            "profile" | "profile_update" | "profile-update" => return Some(EventKind::ProfileUpdate),
            arg => panic!("unexpect data to generate '{arg}'"),
        }
        None
    })
    .collect::<Vec<_>>();

    let start = Instant::now();
    println!("Connecting to {address}");
    let mut set = JoinSet::new();
    for kind in to_generate {
        println!("Generating {amount} {kind:?} events using {clients} clients...");
        let amount_per = amount /clients;
        for _ in 0..clients {
            set.spawn(gen_data(address.clone(), kind, amount_per));
        }
    }

    while let Some(res) = set.join_next().await {
        match res {
            Ok(()) => {},
            Err(err) if err.is_panic() => panic::resume_unwind(err.into_panic()),
            Err(err) => panic!("Unexpected error: {err}"),
        }
    }

    println!("Generated all events in {:?}", start.elapsed());
}

/// Matches ContentBody variants.
#[derive(Copy, Clone, Debug)]
enum EventKind {
    Post,
    Delete,
    /*
    Follow,
    Block,
    Reaction,
    AttributedToReaction,
    */
    ProfileUpdate,
    /*
    Identity,
    Repost,
    Report,
    Labels,
    VerificationClaim,
    VerificationVerify,
    VerificationTarget,
    */
}

async fn gen_data(address: String, kind: EventKind, amount: usize) {
    let client = Client::new(address).await;
    match kind {
        EventKind::Post => gen_post(client, amount).await,
        EventKind::Delete => gen_delete(client, amount).await,
        EventKind::ProfileUpdate => gen_profile_update(client, amount).await,
    }
}

async fn gen_post(mut client: Client, amount: usize) {
    let mut last: Option<EventKey> = None;
    for _ in 0..amount {
        client.post(
            Post {
                text: random_string(10, 1000),
                reply: if let Some(last) = last.as_ref() && rand::random() {
                    Some(PostReply {
                        root: Some(last.clone()),
                        parent: Some(last.clone()),
                    })
                } else {
                    None
                },
                images: Vec::new(), //Vec<ImageSet>,
                quote: if let Some(last) = last.as_ref() && rand::random() {
                    Some(last.clone())
                } else {
                    None
                },
                links: Vec::new(), // Vec<Link>,
                labels: random_strings(/* amount. */ 0, 10, /* label length*/ 3, 30),
                attributed_to: Vec::new(), // Vec<AttributedTo>,
            },
            current_timestamp(),
        );
        last = Some(client.get_last_event_key());

        if client.pending.len() > MAX_EVENTS_PER_REQUEST {
            client.submit_events().await
        }
    }
    client.submit_events().await
}

async fn gen_delete(mut client: Client, amount: usize) {
    for _ in 0..amount {
        client.post(
            Post {
                text: random_string(10, 1000),
                reply: None,
                images: Vec::new(),
                quote: None,
                links: Vec::new(),
                labels: Vec::new(),
                attributed_to: Vec::new(),
            },
            current_timestamp(),
        );
        let event_key = client.get_last_event_key();
        client.delete_key(event_key, current_timestamp());

        if client.pending.len() > MAX_EVENTS_PER_REQUEST {
            client.submit_events().await
        }
    }
    client.submit_events().await
}

async fn gen_profile_update(mut client: Client, amount: usize) {
    for _ in 0..amount {
        client.profile_update(
            ProfileUpdate {
                name: optional_random_string(5, 100),
                avatar: None, // Option<ImageSet>,
                banner: None, // Option<ImageSet>,
                description: optional_random_string(10, 500),
                alias: optional_random_string(3, 20),
            },
            current_timestamp(),
        );

        if client.pending.len() > MAX_EVENTS_PER_REQUEST {
            client.submit_events().await
        }
    }
    client.submit_events().await
}


#[derive(Debug)]
struct Client {
    key: SigningKey,
    identity: String,
    event_sync_client: EventSyncServiceClient<tonic::transport::Channel>,
    pending: Vec<EventBundle>,
    identity_sequence: Sequence,
    collection_sequences: [Sequence; COLLECTION_MAX as usize + 1], // 1-indexed.
}

#[derive(Debug)]
struct Sequence(u64);

impl Sequence {
    const fn new() -> Sequence {
        Sequence(1)
    }

    fn next(&mut self) -> u64 {
        let val = self.0;
        self.0 += 1;
        val
    }
}

#[allow(dead_code)] // Not all methods are used.
impl Client {
    async fn new(address: String) -> Client {
        let key = SigningKey::from_bytes(&rand::random());
        let event_sync_client = EventSyncServiceClient::connect(address)
            .await
            .expect("failed to connect");
        let identity = Identity {
            rotation_keys: vec![public_key_of(&key)],
            signing_keys: vec![],
            revocation_bounds: vec![],
            servers: None,
            recovery_key: None,
            recovery_signature: None,
        };
        let mut client = Client {
            key,
            identity: identity.derive_hex_key(),
            event_sync_client,
            pending: Vec::new(),
            identity_sequence: Sequence::new(),
            collection_sequences: [const { Sequence::new() }; _],
        };
        client.set_identity(identity, current_timestamp());
        client
    }

    fn identity(&self) -> &str {
        &self.identity
    }

    fn event_sync_client(
        &mut self,
    ) -> &mut EventSyncServiceClient<tonic::transport::Channel> {
        &mut self.event_sync_client
    }

    // All these methods push an event bundle to the list of pending events to
    // sync. `submit_events` submits all the events to the server.

    fn set_identity(
        &mut self,
        identity: Identity,
        created_at: u64,
    ) -> Vec<u8> {
        self.push_event_bundle(ContentBody::Identity(identity), created_at)
    }

    fn profile_update(
        &mut self,
        update: ProfileUpdate,
        created_at: u64,
    ) -> Vec<u8> {
        self.push_event_bundle(ContentBody::ProfileUpdate(update), created_at)
    }

    fn post(&mut self, post: Post, created_at: u64) -> Vec<u8> {
        self.push_event_bundle(ContentBody::Post(post), created_at)
    }

    fn post_text(&mut self, text: &str, created_at: u64) -> Vec<u8> {
        let post = Post {
            text: text.to_owned(),
            reply: None,
            images: Vec::new(),
            quote: None,
            links: Vec::new(),
            labels: Vec::new(),
            attributed_to: Vec::new(),
        };
        self.post(post, created_at)
    }

    fn quote(
        &mut self,
        post: EventKey,
        text: &str,
        created_at: u64,
    ) -> Vec<u8> {
        let post = Post {
            text: text.to_owned(),
            reply: None,
            images: Vec::new(),
            quote: Some(post),
            links: Vec::new(),
            labels: Vec::new(),
            attributed_to: Vec::new(),
        };
        self.post(post, created_at)
    }

    fn reply(
        &mut self,
        post: EventKey,
        text: &str,
        created_at: u64,
    ) -> Vec<u8> {
        let post = Post {
            text: text.to_owned(),
            reply: Some(PostReply {
                root: None,
                parent: Some(post),
            }),
            images: Vec::new(),
            quote: None,
            links: Vec::new(),
            labels: Vec::new(),
            attributed_to: Vec::new(),
        };
        self.post(post, created_at)
    }

    fn label(&mut self, labels: Labels, created_at: u64) -> Vec<u8> {
        self.push_event_bundle(ContentBody::Labels(labels), created_at)
    }

    fn follow(&mut self, follow: Follow, created_at: u64) -> Vec<u8> {
        self.push_event_bundle(ContentBody::Follow(follow), created_at)
    }

    fn follow_identity(
        &mut self,
        identity: String,
        created_at: u64,
    ) -> Vec<u8> {
        self.follow(Follow { identity }, created_at)
    }

    fn react(&mut self, reaction: Reaction, created_at: u64) -> Vec<u8> {
        self.push_event_bundle(ContentBody::Reaction(reaction), created_at)
    }

    fn thumbs_up(&mut self, on: EventKey, created_at: u64) -> Vec<u8> {
        self.react(
            Reaction {
                event_key: Some(on),
                emoji: Some("👍".to_owned()),
                positive: true,
            },
            created_at,
        )
    }

    fn thumbs_down(&mut self, on: EventKey, created_at: u64) -> Vec<u8> {
        self.react(
            Reaction {
                event_key: Some(on),
                emoji: Some("👎".to_owned()),
                positive: false,
            },
            created_at,
        )
    }

    fn repost(&mut self, repost: Repost, created_at: u64) -> Vec<u8> {
        self.push_event_bundle(ContentBody::Repost(repost), created_at)
    }

    fn repost_key(
        &mut self,
        event_key: EventKey,
        created_at: u64,
    ) -> Vec<u8> {
        let repost = Repost {
            post: Some(event_key),
        };
        self.repost(repost, created_at)
    }

    fn delete(&mut self, delete: Delete, created_at: u64) -> Vec<u8> {
        self.push_event_bundle(ContentBody::Delete(delete), created_at)
    }

    fn delete_key(
        &mut self,
        event_key: EventKey,
        created_at: u64,
    ) -> Vec<u8> {
        let delete = Delete {
            event_key: Some(event_key),
        };
        self.delete(delete, created_at)
    }

    fn get_last_event_key(&self) -> EventKey {
        let event = self.pending.last().expect("no pending events");
        let signed_event = event.signed_event.as_ref().unwrap();
        let event = Event::decode(&*signed_event.event_bytes).unwrap();
        event.key.unwrap()
    }

    fn push_event_bundle(
        &mut self,
        body: ContentBody,
        created_at: u64,
    ) -> Vec<u8> {
        let collection = match &body {
            ContentBody::Post(_) | ContentBody::Delete(_) => collections::FEED,
            ContentBody::Follow(_) | ContentBody::Block(_) => {
                collections::SOCIAL_GRAPH
            }
            ContentBody::Reaction(_) | ContentBody::AttributedToReaction(_) => {
                collections::INTERACTIONS
            }
            ContentBody::ProfileUpdate(_) => collections::PROFILE,
            ContentBody::Identity(_) => collections::IDENTITY,
            ContentBody::Repost(_) => collections::FEED,
            ContentBody::Report(_) => collections::REPORTS,
            ContentBody::Labels(_) => collections::LABELS,
            ContentBody::VerificationClaim(_)
            | ContentBody::VerificationVerify(_)
            | ContentBody::VerificationTarget(_) => collections::VERIFICATIONS,
        };
        let content = Content {
            content_body: Some(body),
        };
        let (content_bytes, digest) = content_with_digest(content);
        let event = self.make_event(
            collection,
            Vec::new(),
            Vec::new(),
            digest,
            created_at,
        );
        let event_bundle = bundle(sign(&self.key, event), content_bytes);
        let signature = bundle_signature(&event_bundle);
        self.pending.push(event_bundle);
        signature
    }

    fn make_event(
        &mut self,
        collection: i32,
        previous_signature: Vec<u8>,
        previous_root: Vec<u8>,
        digest: ContentDigest,
        created_at: u64,
    ) -> Event {
        Event {
            key: Some(EventKey {
                collection,
                identity: self.identity.clone(),
                signed_by: Some(public_key_of(&self.key)),
                sequence: self.collection_sequences[collection as usize].next(),
            }),
            identity_sequence: self.identity_sequence.next(),
            vector_clock: Some(VectorClock { sequence: vec![1] }),
            previous_signature,
            previous_root,
            content_digest: Some(digest),
            created_at,
        }
    }

    /// Submit all pending events.
    async fn submit_events(&mut self) {
        let event_bundles = take(&mut self.pending);
        if event_bundles.is_empty() {
            return;
        }

        self.event_sync_client
            .put_events(PutEventsRequest { event_bundles })
            .await
            .expect("put_events failed");
    }

    /*
    fn create_auth_token(&self) -> String {
        let header = serde_json::json!({
            "alg": "EdDSA",
            "typ": "JWT",
            "kid": hex::encode(self.key.verifying_key().as_bytes()),
        });

        let now = current_timestamp();
        let payload = ServerJwtClaims {
            iss: self.identity().to_owned(),
            aud: audience(),
            iat: now,
            exp: now + (24 * 60 * 60),
        };

        let to_sign = format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&header).unwrap()),
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap()),
        );
        let signature = self.key.sign(to_sign.as_bytes());

        format!(
            "Bearer {to_sign}.{}",
            URL_SAFE_NO_PAD.encode(signature.to_bytes().as_slice()),
        )
    }
    */
}

fn public_key_of(key: &SigningKey) -> PublicKey {
    PublicKey {
        key_type: KeyType::Ed25519.into(),
        key: key.verifying_key().as_bytes().to_vec(),
    }
}

fn content_with_digest(content: Content) -> (Vec<u8>, ContentDigest) {
    let bytes = prost::Message::encode_to_vec(&content);
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: Sha256::digest(&bytes).to_vec(),
    };
    (bytes, digest)
}

fn bundle_signature(bundle: &EventBundle) -> Vec<u8> {
    bundle.signed_event
        .as_ref()
        .expect("bundle missing signed_event")
        .signature
        .clone()
}

fn sign(signing_key: &SigningKey, event: Event) -> SignedEvent {
    let event_bytes = event.encode_to_vec();
    let signature = signing_key.sign(&event_bytes).to_bytes().to_vec();
    SignedEvent {
        signature,
        event_bytes,
    }
}

fn bundle(signed_event: SignedEvent, content_bytes: Vec<u8>) -> EventBundle {
    EventBundle {
        signed_event: Some(signed_event),
        serialized_content: Some(SerializedContent { content_bytes }),
        event_proofs: vec![],
        meta: None,
    }
}

fn current_timestamp() -> u64 {
        SystemTime::UNIX_EPOCH.elapsed().unwrap().as_secs()
}

fn random_strings(min_length: usize, max_length: usize, str_min_length: usize, str_max_length: usize) -> Vec<String> {
    let mut strings = Vec::with_capacity(rand::random_range(min_length..=max_length));
    for _ in 0..strings.capacity() {
        strings.push(random_string(str_min_length, str_max_length));
    }
    strings
}

fn optional_random_string(min_length: usize, max_length: usize) -> Option<String> {
    if rand::random() {
        Some(random_string(min_length, max_length))
    } else {
        None
    }
}

fn random_string(min_length: usize, max_length: usize) -> String {
    let length = rand::random_range(min_length..=max_length);
    SampleString::sample_string(&Alphabetic, &mut rand::rng(), length)
}
