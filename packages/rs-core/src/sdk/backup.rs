//! Identity backups: a recovery key plus the identity chain it belongs to,
//! handed to the user as text. rs-core creates, reads and checks them, so
//! hosts never handle the signed chain inside.
//!
//! The text is the hex of a serialized `IdentityBackup`, the format the apps
//! have always written.

use polycentric_common::models::protos_v2::{
    Content, Event, EventBundle, IdentityBackup, PrivateKey, content::ContentBody,
};
use prost::Message;

use crate::sdk::client::Client;
use crate::sdk::error::{SdkError, SdkResult};
use crate::sdk::keys::{KeyPair, keys_equal};
use crate::sdk::storage::LoginId;
use crate::sdk::types::LoginKind;

/// What a backup is for.
#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct BackupInfo {
    pub identity_key: String,
    /// Sequence of the newest identity event in the backup.
    pub sequence: u64,
}

/// Whether a backup can restore an identity.
#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum BackupCheck {
    /// Its recovery key is the identity's current one.
    Valid,
    /// Its recovery key was rotated out; a newer backup replaced it.
    Stale,
    /// It's for a different identity.
    OtherIdentity,
    /// It isn't a backup, or its key doesn't recover the identity.
    Invalid,
}

/// Decode backup text.
pub fn decode_backup(text: &str) -> SdkResult<IdentityBackup> {
    let bytes =
        hex::decode(text.trim()).map_err(|_| SdkError::InvalidInput("backup is not hex".into()))?;
    let backup = IdentityBackup::decode(bytes.as_slice())?;
    if backup.recovery_key.is_none() || backup.identity_key.is_empty() {
        return Err(SdkError::InvalidInput("backup is incomplete".into()));
    }
    Ok(backup)
}

pub fn encode_backup(backup: &IdentityBackup) -> String {
    hex::encode(backup.encode_to_vec())
}

/// The identity a backup is for and how recent it is.
pub fn backup_info(text: &str) -> SdkResult<BackupInfo> {
    let backup = decode_backup(text)?;
    let sequence = backup
        .identity_chain
        .last()
        .and_then(event_of)
        .and_then(|e| e.key)
        .map(|k| k.sequence)
        .ok_or_else(|| SdkError::InvalidInput("backup has no identity events".into()))?;
    Ok(BackupInfo {
        identity_key: backup.identity_key,
        sequence,
    })
}

fn event_of(bundle: &EventBundle) -> Option<Event> {
    Event::decode(bundle.signed_event.as_ref()?.event_bytes.as_slice()).ok()
}

/// The recovery key an identity bundle's document names.
fn recovery_key_of(
    bundle: &EventBundle,
) -> Option<polycentric_common::models::protos_v2::PublicKey> {
    let content =
        Content::decode(bundle.serialized_content.as_ref()?.content_bytes.as_slice()).ok()?;
    match content.content_body? {
        ContentBody::Identity(identity) => identity.recovery_key,
        _ => None,
    }
}

impl Client {
    /// Rotate the active identity's recovery key and return a backup of it
    /// as text. Older backups stop working.
    pub async fn create_backup(&self) -> SdkResult<String> {
        let identity_key = self.active_identity().ok_or(SdkError::NoActiveIdentity)?;
        let recovery_key = self.rotate_recovery_key().await?;
        let backup = IdentityBackup {
            identity_key: identity_key.clone(),
            identity_chain: self.resolve_identity_chain(&identity_key)?,
            recovery_key: Some(recovery_key),
        };
        Ok(encode_backup(&backup))
    }

    /// Whether `text` can restore `identity` (default: the active one).
    /// Copies the backup's identity chain into the protocol engine (not
    /// storage) to judge it.
    pub fn check_backup(&self, text: &str, identity: Option<&str>) -> BackupCheck {
        let Ok(backup) = decode_backup(text) else {
            return BackupCheck::Invalid;
        };
        let identity = match identity {
            Some(i) => i.to_string(),
            None => match self.active_identity() {
                Some(i) => i,
                None => return BackupCheck::Invalid,
            },
        };
        if backup.identity_key != identity {
            return BackupCheck::OtherIdentity;
        }
        let Some(recovery_key) = &backup.recovery_key else {
            return BackupCheck::Invalid;
        };
        self.copy_backup_events(&backup);
        if self.check_recovery_key(recovery_key, Some(&identity)) {
            return BackupCheck::Valid;
        }
        if self.is_stale_recovery_key(recovery_key, &identity) {
            BackupCheck::Stale
        } else {
            BackupCheck::Invalid
        }
    }

    /// Whether `key` was the identity's recovery key in an older document
    /// but isn't in the current one.
    fn is_stale_recovery_key(&self, key: &PrivateKey, identity: &str) -> bool {
        let Ok(public) = KeyPair::from_private_key_proto(key).map(|k| k.public_key()) else {
            return false;
        };
        let Ok(mut chain) = self.resolve_identity_chain(identity) else {
            return false;
        };
        let Some(head) = chain.pop() else {
            return false;
        };
        let matches = |b: &EventBundle| recovery_key_of(b).is_some_and(|k| keys_equal(&k, &public));
        !matches(&head) && chain.iter().any(matches)
    }

    /// Restore the identity a backup is for on this device: authorize a
    /// new key with the backup's recovery key and sign in as it.
    pub async fn recover_from_backup(&self, text: &str) -> SdkResult<LoginId> {
        let backup = decode_backup(text)?;
        let pending = self
            .begin_login(&backup.identity_key, LoginKind::Recovery)
            .await?;
        match self.recover_identity(&pending.key_pair, &backup).await {
            Ok(()) => Ok(pending.id),
            Err(e) => {
                if let Err(cleanup) = self.delete_login(pending.id).await {
                    crate::logging::log_warn(|| {
                        format!("could not remove the failed recovery login: {cleanup}")
                    });
                }
                Err(e)
            }
        }
    }
}
