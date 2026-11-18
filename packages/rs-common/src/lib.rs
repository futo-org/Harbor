//! Shared Rust code for the Polycentric protocol, used by `rs-core` and the
//! server-side services.

#[cfg(feature = "uniffi")]
uniffi::setup_scaffolding!();

/// Crate-wide error and result types.
pub mod error;
pub mod jwt;
pub mod mentions;
pub mod merkle;
pub mod models;
/// Detailed error type shared with platform bindings.
pub mod platform;
/// Ed25519 signature verification.
pub mod signing;
