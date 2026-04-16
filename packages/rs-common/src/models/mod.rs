pub mod protos {
    include!(concat!(env!("OUT_DIR"), "/polycentric.rs"));
    include!(concat!(env!("OUT_DIR"), "/polycentric_ffi.rs"));
}

#[allow(dead_code, unused_attributes)]
pub mod protos_v2 {
    tonic::include_proto!("polycentric.v2");

    pub const FILE_DESCRIPTOR_SET: &[u8] =
        include_bytes!(concat!(env!("OUT_DIR"), "/polycentric_v2.bin"));
}

pub mod traits;

pub mod digest;
pub mod event;
pub mod event_array;
pub mod moderation_tag;
pub mod pointer;
pub mod public_key;
pub mod query_engine_stats;
pub mod signed_event;

pub use traits::Serializable;

pub use crate::models::protos::*;
