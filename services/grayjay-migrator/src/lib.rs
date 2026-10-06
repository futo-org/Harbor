//! grayjay-migrator: bridge legacy (v1) Polycentric systems onto Harbor (v2).
//!
//! Two binaries share these modules:
//! - `grayjay-migrate` (`bin/migrate.rs`): the one-shot migration tool. Reads
//!   the legacy server's Postgres, creates a v2 identity per legacy system
//!   (signed by the master key, with the legacy key added as a rotation key),
//!   re-signs the system's posts/profile/reactions/claims, records the mapping,
//!   and pushes the events to the Harbor servers.
//! - `grayjay-migrator` (`main.rs`): a long-running HTTP service exposing the
//!   legacy-system-key -> new-identity lookup.

pub mod config;
pub mod convert;
pub mod db;
pub mod legacy;
pub mod mapping;
pub mod og;
pub mod polycentric;
pub mod rumble;
pub mod seed;
pub mod youtube;
