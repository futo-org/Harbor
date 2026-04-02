#![allow(renamed_and_removed_lints)]

include!(concat!(env!("OUT_DIR"), "/protos/mod.rs"));

pub use legacy_polycentric as protocol;

pub mod model;
pub mod test_utils;
