//! Create and manage a Polycentric identity.

mod event;
mod identity;
pub mod key;
mod polycentric;
pub mod store;

use std::path::PathBuf;

use anyhow::{Context, Result};

pub use key::{KeyKind, KeyPair};
pub use store::{AddedKey, ChainEntry, ExportedEvent, IdentityStore};

/// Directory name, under the user's home, where the keystore lives.
pub const DIR_NAME: &str = ".polycentric";

/// Default storage directory: `~/.polycentric`.
pub fn default_dir() -> Result<PathBuf> {
    let home = std::env::var_os("HOME").context("HOME environment variable is not set")?;
    Ok(PathBuf::from(home).join(DIR_NAME))
}
