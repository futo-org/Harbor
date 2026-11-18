//! Merkle trees over event streams.
//!
//! [`canonical_signatures`] gives the leaves (event signatures in canonical
//! order), [`tree`] hashes them per RFC 6962, and [`verify_proof`] checks a
//! leaf's audit path against an `EventProofTarget`.

/// Canonical leaf ordering for an event stream.
pub mod leaves;
pub mod proof;
pub mod tree;

pub use leaves::canonical_signatures;
pub use proof::verify_proof;
pub use tree::{Hash, build_audit_path, leaf_hash, merkle_tree_hash, node_hash, verify_inclusion};
