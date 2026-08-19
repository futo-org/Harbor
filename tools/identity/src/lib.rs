//! Create and manage a Polycentric identity.

mod event;
mod identity;
pub mod key;
mod polycentric;
pub mod store;

use std::path::PathBuf;

use anyhow::{Error, Result};

pub use key::{KeyKind, KeyPair};
pub use store::{AddedKey, ChainEntry, ExportedEvent, IdentityStore};

/// Directory name, under the user's home, where the keystore lives.
pub const DIR_NAME: &str = ".polycentric";

/// Default storage directory: `~/.polycentric`.
pub fn default_dir() -> Result<PathBuf> {
    let home =
        std::env::home_dir().ok_or_else(|| Error::msg("unable to determine home directory"))?;
    Ok(home.join(DIR_NAME))
}
