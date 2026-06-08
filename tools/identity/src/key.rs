//! Ed25519 keypairs and the roles they play in an identity.

use ed25519_dalek::{Signer, SigningKey};
use polycentric_common::models::protos_v2::{KeyType, PublicKey};

/// Length of an Ed25519 private key, in bytes.
pub const PRIVATE_KEY_LEN: usize = 32;

/// Which role a key plays in the identity.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KeyKind {
    /// Controls the identity and can issue new keys.
    Rotation,
    /// May sign events but cannot change the identity.
    Signing,
}

impl KeyKind {
    pub fn as_str(self) -> &'static str {
        match self {
            KeyKind::Rotation => "rotation",
            KeyKind::Signing => "signing",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "rotation" => Some(KeyKind::Rotation),
            "signing" => Some(KeyKind::Signing),
            _ => None,
        }
    }
}

/// An Ed25519 keypair: a private key and its derived public key.
pub struct KeyPair {
    pub public_key: Vec<u8>,
    pub private_key: [u8; PRIVATE_KEY_LEN],
}

impl KeyPair {
    /// Generate a new keypair from OS entropy.
    pub fn generate() -> Self {
        let mut private_key = [0u8; PRIVATE_KEY_LEN];
        getrandom::getrandom(&mut private_key).expect("OS random number generator failed");
        Self::from_private_key(private_key)
    }

    /// Reconstruct the keypair from a stored private key.
    pub fn from_private_key(private_key: [u8; PRIVATE_KEY_LEN]) -> Self {
        let public_key = SigningKey::from_bytes(&private_key)
            .verifying_key()
            .to_bytes()
            .to_vec();
        Self {
            public_key,
            private_key,
        }
    }

    /// The public key as a protobuf [`PublicKey`] (Ed25519).
    pub fn to_public_key(&self) -> PublicKey {
        PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: self.public_key.clone(),
        }
    }

    pub fn public_hex(&self) -> String {
        hex::encode(&self.public_key)
    }

    /// Sign `message` with this keypair's private key (64-byte Ed25519 signature).
    pub fn sign(&self, message: &[u8]) -> Vec<u8> {
        SigningKey::from_bytes(&self.private_key)
            .sign(message)
            .to_bytes()
            .to_vec()
    }
}
