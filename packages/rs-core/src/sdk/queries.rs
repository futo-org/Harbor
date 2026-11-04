//! Queries across the FFI. The query layer merges server responses as
//! encoded bytes; here each emission is decoded once, into the [`QueryData`]
//! variant for the query's response type, before it reaches a host.

use std::collections::HashMap;
use std::sync::Arc;

use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use polycentric_common::models::protos_v2 as pb;
use prost::Message;

use crate::api::Query;
use crate::query::event::labels::{LabelSet, build_label_sets};
use crate::query::{ByteObservable, ByteObserver, ByteResult, QueryStatus};
use crate::records;
use crate::rx::subscription::Subscription;

/// A query's merged result, by the kind of response it produces.
// Boxing would change the FFI type; results are moved, not stored in bulk.
#[allow(clippy::large_enum_variant)]
#[derive(Clone, Debug, PartialEq, uniffi::Enum)]
pub enum QueryData {
    Profile {
        response: records::GetProfileResponse,
    },
    /// `GetEvent`. The bundle is empty when no server has the event.
    Event {
        bundle: records::EventBundle,
    },
    Post {
        response: records::GetPostResponse,
        labels: Vec<LabelSet>,
    },
    PostThread {
        response: records::GetPostThreadResponse,
        labels: Vec<LabelSet>,
    },
    /// Every feed query (identity, following, recommended, explore,
    /// attribution).
    Feed {
        response: records::GetFeedResponse,
        labels: Vec<LabelSet>,
    },
    Notifications {
        response: records::ListNotificationsResponse,
        labels: Vec<LabelSet>,
    },
    UnreadNotificationCount {
        response: records::SubscribeUnreadNotificationCountResponse,
    },
    Heads {
        response: records::ListHeadsResponse,
    },
    Events {
        response: records::ListEventsResponse,
    },
    VerificationClaims {
        response: records::ListVerificationClaimsResponse,
    },
    VerificationTargets {
        response: records::ListVerificationTargetsResponse,
    },
    VerificationVerifies {
        response: records::ListVerificationVerifiesResponse,
    },
    TargetedVerificationClaims {
        response: records::ListTargetedVerificationClaimsResponse,
    },
    VerifiedClaims {
        response: records::ResolveVerifiedClaimsResponse,
    },
    /// `ListFollowing` and `ListFollowers`.
    Follows {
        response: records::ListFollowsResponse,
    },
    SuggestedFollows {
        response: records::SuggestFollowResponse,
    },
    SearchPosts {
        response: records::SearchPostsResponse,
        labels: Vec<LabelSet>,
    },
    SearchUsers {
        response: records::SearchUsersResponse,
    },
    /// `IsModerator` and `IsBanned`: each server's answer.
    StatusByServer {
        by_server: HashMap<String, bool>,
    },
    Bans {
        response: records::ListBansResponse,
    },
    /// `ListReports`: each server's reports.
    ReportsByServer {
        by_server: HashMap<String, records::ListReportsResponse>,
    },
    Reactions {
        response: records::GetReactionsResponse,
    },
}

/// An emission from a [`QueryObservable`].
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct QueryResult {
    pub data: Option<QueryData>,
    /// The payload was empty: nothing cached locally yet, as opposed to a
    /// server's (possibly empty) answer.
    pub empty: bool,
    pub status: QueryStatus,
    pub successful_servers: u32,
    pub pending_servers: u32,
}

/// Receives a query's results. Called from rs-core; return quickly.
#[uniffi::export(with_foreign)]
pub trait QueryObserver: Send + Sync {
    fn next(&self, result: QueryResult);
    fn error(&self, message: String);
    fn complete(&self);
}

/// The response type a query produces.
#[derive(Clone, Copy, Debug)]
pub(crate) enum Kind {
    Profile,
    Event,
    Post,
    PostThread,
    Feed,
    Notifications,
    UnreadNotificationCount,
    Heads,
    Events,
    VerificationClaims,
    VerificationTargets,
    VerificationVerifies,
    TargetedVerificationClaims,
    VerifiedClaims,
    Follows,
    SuggestedFollows,
    SearchPosts,
    SearchUsers,
    StatusByServer,
    Bans,
    ReportsByServer,
    Reactions,
}

impl Kind {
    pub(crate) fn of(query: &Query) -> Self {
        match query {
            Query::GetProfile(_) => Kind::Profile,
            Query::GetEvent(_) => Kind::Event,
            Query::GetPost(_) => Kind::Post,
            Query::GetPostThread(_) => Kind::PostThread,
            Query::GetIdentityFeed(_)
            | Query::GetFollowingFeed(_)
            | Query::GetRecommendedFeed(_)
            | Query::GetExploreFeed(_)
            | Query::GetAttributionFeed(_) => Kind::Feed,
            Query::ListNotifications(_) => Kind::Notifications,
            Query::SubscribeUnreadNotificationCount(_) => Kind::UnreadNotificationCount,
            Query::SubscribeHeads(_) => Kind::Heads,
            Query::ListEvents(_) => Kind::Events,
            Query::ListVerificationClaims(_) => Kind::VerificationClaims,
            Query::ListVerificationTargets(_) => Kind::VerificationTargets,
            Query::ListVerificationVerifies(_) => Kind::VerificationVerifies,
            Query::ListTargetedVerificationClaims(_) => Kind::TargetedVerificationClaims,
            Query::ResolveVerifiedClaims(_) => Kind::VerifiedClaims,
            Query::ListFollowing(_) | Query::ListFollowers(_) => Kind::Follows,
            Query::SuggestFollow(_) => Kind::SuggestedFollows,
            Query::SearchPosts(_) => Kind::SearchPosts,
            Query::SearchUsers(_) => Kind::SearchUsers,
            Query::IsModerator(_) | Query::IsBanned(_) => Kind::StatusByServer,
            Query::ListBans(_) => Kind::Bans,
            Query::ListReports(_) => Kind::ReportsByServer,
            Query::GetReactions(_) => Kind::Reactions,
        }
    }

    /// Decode a merged payload. `None` if it doesn't decode.
    pub(crate) fn decode(self, bytes: &[u8]) -> Option<QueryData> {
        fn msg<M: Message + Default>(bytes: &[u8]) -> Option<M> {
            M::decode(bytes).ok()
        }
        Some(match self {
            Kind::Profile => QueryData::Profile {
                response: msg::<pb::GetProfileResponse>(bytes)?.into(),
            },
            Kind::Event => QueryData::Event {
                bundle: msg::<pb::EventBundle>(bytes)?.into(),
            },
            Kind::Post => {
                let response = msg::<pb::GetPostResponse>(bytes)?;
                QueryData::Post {
                    labels: build_label_sets(&response.event_hints),
                    response: response.into(),
                }
            }
            Kind::PostThread => {
                let response = msg::<pb::GetPostThreadResponse>(bytes)?;
                QueryData::PostThread {
                    labels: build_label_sets(&response.event_hints),
                    response: response.into(),
                }
            }
            Kind::Feed => {
                let response = msg::<pb::GetFeedResponse>(bytes)?;
                QueryData::Feed {
                    labels: build_label_sets(&response.event_hints),
                    response: response.into(),
                }
            }
            Kind::Notifications => {
                let response = msg::<pb::ListNotificationsResponse>(bytes)?;
                QueryData::Notifications {
                    labels: build_label_sets(&response.event_hints),
                    response: response.into(),
                }
            }
            Kind::UnreadNotificationCount => QueryData::UnreadNotificationCount {
                response: msg::<pb::SubscribeUnreadNotificationCountResponse>(bytes)?.into(),
            },
            Kind::Heads => QueryData::Heads {
                response: msg::<pb::ListHeadsResponse>(bytes)?.into(),
            },
            Kind::Events => QueryData::Events {
                response: msg::<pb::ListEventsResponse>(bytes)?.into(),
            },
            Kind::VerificationClaims => QueryData::VerificationClaims {
                response: msg::<pb::ListVerificationClaimsResponse>(bytes)?.into(),
            },
            Kind::VerificationTargets => QueryData::VerificationTargets {
                response: msg::<pb::ListVerificationTargetsResponse>(bytes)?.into(),
            },
            Kind::VerificationVerifies => QueryData::VerificationVerifies {
                response: msg::<pb::ListVerificationVerifiesResponse>(bytes)?.into(),
            },
            Kind::TargetedVerificationClaims => QueryData::TargetedVerificationClaims {
                response: msg::<pb::ListTargetedVerificationClaimsResponse>(bytes)?.into(),
            },
            Kind::VerifiedClaims => QueryData::VerifiedClaims {
                response: msg::<pb::ResolveVerifiedClaimsResponse>(bytes)?.into(),
            },
            Kind::Follows => QueryData::Follows {
                response: msg::<pb::ListFollowsResponse>(bytes)?.into(),
            },
            Kind::SuggestedFollows => QueryData::SuggestedFollows {
                response: msg::<pb::SuggestFollowResponse>(bytes)?.into(),
            },
            Kind::SearchPosts => {
                let response = msg::<pb::SearchPostsResponse>(bytes)?;
                QueryData::SearchPosts {
                    labels: build_label_sets(&response.event_hints),
                    response: response.into(),
                }
            }
            Kind::SearchUsers => QueryData::SearchUsers {
                response: msg::<pb::SearchUsersResponse>(bytes)?.into(),
            },
            Kind::StatusByServer => QueryData::StatusByServer {
                by_server: serde_json::from_slice(bytes).ok()?,
            },
            Kind::Bans => QueryData::Bans {
                response: msg::<pb::ListBansResponse>(bytes)?.into(),
            },
            Kind::ReportsByServer => {
                let encoded: HashMap<String, String> = serde_json::from_slice(bytes).ok()?;
                let by_server = encoded
                    .into_iter()
                    .filter_map(|(server, b64)| {
                        let bytes = BASE64_STANDARD.decode(b64).ok()?;
                        Some((server, msg::<pb::ListReportsResponse>(&bytes)?.into()))
                    })
                    .collect();
                QueryData::ReportsByServer { by_server }
            }
            Kind::Reactions => QueryData::Reactions {
                response: msg::<pb::GetReactionsResponse>(bytes)?.into(),
            },
        })
    }
}

/// A running query. Subscribe to receive its results as servers answer.
#[derive(uniffi::Object)]
pub struct QueryObservable {
    inner: Arc<dyn ByteObservable>,
    kind: Kind,
}

impl QueryObservable {
    pub(crate) fn new(inner: Arc<dyn ByteObservable>, kind: Kind) -> Arc<Self> {
        Arc::new(Self { inner, kind })
    }
}

#[uniffi::export]
impl QueryObservable {
    pub fn subscribe(&self, observer: Arc<dyn QueryObserver>) -> Arc<Subscription> {
        self.inner.subscribe(Arc::new(Decoding {
            observer,
            kind: self.kind,
        }))
    }
}

struct Decoding {
    observer: Arc<dyn QueryObserver>,
    kind: Kind,
}

impl ByteObserver for Decoding {
    fn next(&self, result: ByteResult) {
        self.observer.next(QueryResult {
            empty: result.data.as_ref().is_some_and(|b| b.is_empty()),
            data: result.data.and_then(|b| self.kind.decode(&b)),
            status: result.status,
            successful_servers: result.successful_servers,
            pending_servers: result.pending_servers,
        });
    }

    fn error(&self, message: String) {
        self.observer.error(message);
    }

    fn complete(&self) {
        self.observer.complete();
    }
}
