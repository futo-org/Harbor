mod error;

#[cfg(feature = "ffi")]
pub mod ffi;

#[cfg(target_arch = "wasm32")]
pub mod wasm;
