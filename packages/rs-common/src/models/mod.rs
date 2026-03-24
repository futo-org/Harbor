pub mod protos {
    include!(concat!(env!("OUT_DIR"), "/polycentric.rs"));
    include!(concat!(env!("OUT_DIR"), "/polycentric_ffi.rs"));
}

pub mod traits;

pub mod digest;
pub mod event;
pub mod event_array;
pub mod indices;
pub mod internal;
pub mod lww_element;
pub mod lww_element_set;
pub mod moderation_tag;
pub mod pointer;
pub mod process;
pub mod public_key;
pub mod query_engine_stats;
pub mod reference;
pub mod signed_event;
pub mod vector_clock;

pub use traits::Serializable;

pub use crate::models::protos::{
    ContentType, CountReferencesResult, Digest, Event, EventCreationData, EventKey, FeedCursor,
    Index, Indices, LwwElement, LwwElementSet, ModerationTag, Pointer, Process, ProcessState,
    PublicKey, QueryEngineStats, Range, Reference, ReferenceCursor, SignedEvent, SystemState,
    VectorClock,
};
