use polycentric_common::models::protos::{CountReferencesResult, FeedResult, ReferencesResult};

pub mod crdt;
pub mod engine;
pub mod error;
pub mod feed;
pub mod internal;
pub mod references;
pub mod system;

pub use crdt::CrdtResolver;
pub use engine::QueryEngine;
pub use error::{QueryError, QueryResult};
pub use feed::{FeedCursor, FeedQueryEngine};
pub use internal::{
    CRDTQuery, CrdtResult, EventRangeQuery, EventRangeResult, FeedQuery, LatestEventsQuery,
    LatestEventsResult, ProcessHeadsQuery, ProcessHeadsResult,
};
pub use references::{CountReferencesQuery, ReferencesQuery, ReferencesQueryEngine};
pub use system::{HeadsQueryEngine, MetadataQueryEngine};
