#[allow(dead_code, unused_attributes)]
mod generated {
    tonic::include_proto!("polycentric.v1");
}
pub use generated::*;

pub const FILE_DESCRIPTOR_SET: &[u8] =
    include_bytes!(concat!(env!("OUT_DIR"), "/polycentric.bin"));
