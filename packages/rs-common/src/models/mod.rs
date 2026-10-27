pub mod protos {
    include!(concat!(env!("OUT_DIR"), "/polycentric.rs"));
    include!(concat!(env!("OUT_DIR"), "/polycentric_ffi.rs"));
}

// `large_enum_variant`: generated prost oneofs (e.g. Content.ContentBody) hold
// their largest message variant inline; boxing would change the generated API
// at every call site for no real benefit on deserialized-once messages.
#[allow(dead_code, unused_attributes, clippy::large_enum_variant)]
pub mod protos_v2 {
    tonic::include_proto!("polycentric.v2");

    pub const FILE_DESCRIPTOR_SET: &[u8] =
        include_bytes!(concat!(env!("OUT_DIR"), "/polycentric_v2.bin"));
}

pub mod traits;

pub mod application;
pub mod attributed_to;
pub mod attributed_to_reaction;
pub mod blob;
pub mod block;
pub mod collections;
pub mod content;
pub mod content_body;
pub mod content_digest;
pub mod content_types;
pub mod delete;
pub mod event;
pub mod event_key;
pub mod event_proof_target;
pub mod field_def;
pub mod follow;
pub mod heads;
pub mod identity;
pub mod image;
pub mod image_set;
pub mod labels;
pub mod link;
pub mod moderation_label;
pub mod moderation_tag;
pub mod pointer;
pub mod post;
pub mod post_reply;
pub mod profile_update;
pub mod public_key;
pub mod query_engine_stats;
pub mod reaction;
pub mod report;
pub mod repost;
pub mod revocation_bound;
pub mod serialized_verification_schema;
pub mod server_list;
pub mod signed_event;
pub mod signed_issuer_state;
pub mod signed_message;
pub mod to;
pub mod validate;
pub mod vector_clock;
pub mod verification_claim;
pub mod verification_schema;
pub mod verification_target;
pub mod verification_verify;

pub use traits::Serializable;

pub use crate::models::protos::*;
