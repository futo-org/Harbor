//! Key pairs and key custody.

use std::sync::Arc;

use ed25519_dalek::{Signer, SigningKey};
use polycentric_common::models::protos_v2::{KeyType, PrivateKey, PublicKey};

use crate::sdk::error::{SdkError, SdkResult};
use crate::sdk::storage::StoredPrivateKey;

/// Seals private keys before they're written to storage, and opens them
/// when they're read back. Hosts implement it with their platform keystore
/// (Android Keystore, WebCrypto, the OS keychain).
#[uniffi::export(with_foreign)]
#[cfg_attr(not(target_arch = "wasm32"), async_trait::async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait::async_trait(?Send))]
pub trait KeyCipher: Send + Sync {
    async fn seal(&self, private_key: Vec<u8>) -> Result<Vec<u8>, SdkError>;
    async fn open(&self, sealed: Vec<u8>) -> Result<Vec<u8>, SdkError>;
}

/// An ed25519 key pair.
#[derive(Clone)]
pub struct KeyPair {
    signing_key: SigningKey,
}

impl std::fmt::Debug for KeyPair {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("KeyPair")
            .field(
                "public_key",
                &hex::encode(self.signing_key.verifying_key().as_bytes()),
            )
            .finish_non_exhaustive()
    }
}

impl KeyPair {
    /// A fresh random key pair.
    pub fn generate() -> SdkResult<Self> {
        let mut seed = [0u8; 32];
        getrandom::fill(&mut seed).map_err(|e| SdkError::Crypto(format!("no randomness: {e}")))?;
        Ok(Self::from_seed(&seed))
    }

    pub fn from_seed(seed: &[u8; 32]) -> Self {
        Self {
            signing_key: SigningKey::from_bytes(seed),
        }
    }

    /// The key pair for a private key, which must be an ed25519 seed.
    pub fn from_private_key(key_type: i32, private_key: &[u8]) -> SdkResult<Self> {
        if key_type != KeyType::Ed25519 as i32 {
            return Err(SdkError::InvalidInput(format!(
                "unsupported key type: {key_type}"
            )));
        }
        let seed: [u8; 32] = private_key
            .try_into()
            .map_err(|_| SdkError::InvalidInput("private key must be 32 bytes".into()))?;
        Ok(Self::from_seed(&seed))
    }

    pub fn from_private_key_proto(key: &PrivateKey) -> SdkResult<Self> {
        Self::from_private_key(key.key_type, &key.key)
    }

    pub fn key_type(&self) -> i32 {
        KeyType::Ed25519 as i32
    }

    pub fn public_key(&self) -> PublicKey {
        PublicKey {
            key_type: self.key_type(),
            key: self.signing_key.verifying_key().as_bytes().to_vec(),
        }
    }

    pub fn private_key(&self) -> PrivateKey {
        PrivateKey {
            key_type: self.key_type(),
            key: self.seed().to_vec(),
        }
    }

    pub fn seed(&self) -> [u8; 32] {
        self.signing_key.to_bytes()
    }

    pub fn sign(&self, message: &[u8]) -> Vec<u8> {
        self.signing_key.sign(message).to_bytes().to_vec()
    }
}

/// Whether two public keys are the same key.
pub fn keys_equal(a: &PublicKey, b: &PublicKey) -> bool {
    a.key_type == b.key_type && a.key == b.key
}

/// A [`KeyCipher`] using ChaCha20-Poly1305 under a 32-byte wrapping key the
/// host keeps somewhere safer than the database: the iOS Keychain or
/// Android Keystore (through e.g. expo-secure-store), or a secret store for
/// services.
///
/// Sealed keys are `version (1) || nonce (12) || ciphertext`.
pub struct AeadKeyCipher {
    cipher: chacha20poly1305::ChaCha20Poly1305,
}

const AEAD_VERSION: u8 = 1;
const AEAD_NONCE_BYTES: usize = 12;
/// Binds sealed blobs to their purpose.
const AEAD_ASSOCIATED_DATA: &[u8] = b"polycentric login private key";

impl AeadKeyCipher {
    pub fn new(wrapping_key: &[u8]) -> SdkResult<Self> {
        use chacha20poly1305::KeyInit;
        let cipher = chacha20poly1305::ChaCha20Poly1305::new_from_slice(wrapping_key)
            .map_err(|_| SdkError::InvalidInput("wrapping key must be 32 bytes".into()))?;
        Ok(Self { cipher })
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait::async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait::async_trait(?Send))]
impl KeyCipher for AeadKeyCipher {
    async fn seal(&self, private_key: Vec<u8>) -> Result<Vec<u8>, SdkError> {
        use chacha20poly1305::aead::{Aead, Payload};
        let mut nonce = [0u8; AEAD_NONCE_BYTES];
        getrandom::fill(&mut nonce).map_err(|e| SdkError::Crypto(format!("no randomness: {e}")))?;
        let ciphertext = self
            .cipher
            .encrypt(
                &nonce.into(),
                Payload {
                    msg: &private_key,
                    aad: AEAD_ASSOCIATED_DATA,
                },
            )
            .map_err(|_| SdkError::Crypto("sealing the key failed".into()))?;
        let mut sealed = Vec::with_capacity(1 + AEAD_NONCE_BYTES + ciphertext.len());
        sealed.push(AEAD_VERSION);
        sealed.extend_from_slice(&nonce);
        sealed.extend_from_slice(&ciphertext);
        Ok(sealed)
    }

    async fn open(&self, sealed: Vec<u8>) -> Result<Vec<u8>, SdkError> {
        use chacha20poly1305::aead::{Aead, Payload};
        let (version, rest) = sealed
            .split_first()
            .ok_or_else(|| SdkError::Crypto("sealed key is empty".into()))?;
        if *version != AEAD_VERSION || rest.len() < AEAD_NONCE_BYTES {
            return Err(SdkError::Crypto("unrecognized sealed key".into()));
        }
        let (nonce, ciphertext) = rest.split_at(AEAD_NONCE_BYTES);
        let nonce: [u8; AEAD_NONCE_BYTES] = nonce
            .try_into()
            .map_err(|_| SdkError::Crypto("sealed key nonce is malformed".into()))?;
        self.cipher
            .decrypt(
                &nonce.into(),
                Payload {
                    msg: ciphertext,
                    aad: AEAD_ASSOCIATED_DATA,
                },
            )
            .map_err(|_| {
                SdkError::Crypto("the key could not be opened (wrong wrapping key?)".into())
            })
    }
}

/// A [`KeyCipher`] sealing keys under `wrapping_key` (32 bytes) with
/// ChaCha20-Poly1305. Keep the wrapping key out of the database: in the
/// platform keystore, or a service's secret store.
#[uniffi::export]
pub fn aead_key_cipher(wrapping_key: Vec<u8>) -> Result<Arc<dyn KeyCipher>, SdkError> {
    Ok(Arc::new(AeadKeyCipher::new(&wrapping_key)?))
}

/// A fresh random 32-byte wrapping key for [`aead_key_cipher`].
#[uniffi::export]
pub fn generate_wrapping_key() -> Result<Vec<u8>, SdkError> {
    let mut key = vec![0u8; 32];
    getrandom::fill(&mut key).map_err(|e| SdkError::Crypto(format!("no randomness: {e}")))?;
    Ok(key)
}

/// Seals and opens private keys with an optional [`KeyCipher`]. Without a
/// cipher, keys are stored inline (only allowed for in-memory storage).
#[derive(Clone, Default)]
pub struct KeyVault {
    cipher: Option<Arc<dyn KeyCipher>>,
}

impl KeyVault {
    pub fn new(cipher: Option<Arc<dyn KeyCipher>>) -> Self {
        Self { cipher }
    }

    pub fn has_cipher(&self) -> bool {
        self.cipher.is_some()
    }

    pub async fn seal(&self, key_pair: &KeyPair) -> SdkResult<StoredPrivateKey> {
        let seed = key_pair.seed().to_vec();
        Ok(match &self.cipher {
            Some(cipher) => StoredPrivateKey::Sealed(cipher.seal(seed).await?),
            None => StoredPrivateKey::Inline(seed),
        })
    }

    pub async fn open(&self, key_type: i32, stored: &StoredPrivateKey) -> SdkResult<KeyPair> {
        let seed = match stored {
            StoredPrivateKey::Inline(seed) => seed.clone(),
            StoredPrivateKey::Sealed(sealed) => {
                let cipher = self.cipher.as_ref().ok_or_else(|| {
                    SdkError::Storage("login key is sealed but no key cipher is configured".into())
                })?;
                cipher.open(sealed.clone()).await?
            }
        };
        KeyPair::from_private_key(key_type, &seed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_private_keys() {
        let kp = KeyPair::generate().unwrap();
        let again = KeyPair::from_private_key_proto(&kp.private_key()).unwrap();
        assert_eq!(kp.public_key(), again.public_key());
        assert!(KeyPair::from_private_key(2, &[0; 32]).is_err());
        assert!(KeyPair::from_private_key(1, &[0; 31]).is_err());
    }

    #[tokio::test]
    async fn aead_cipher_round_trips_and_rejects_other_keys() {
        let cipher = AeadKeyCipher::new(&[7; 32]).unwrap();
        let sealed = cipher.seal(vec![9; 32]).await.unwrap();
        assert_eq!(sealed.len(), 1 + 12 + 32 + 16);
        assert_ne!(&sealed[13..45], &[9; 32]);
        assert_eq!(cipher.open(sealed.clone()).await.unwrap(), vec![9; 32]);
        // A fresh nonce each time.
        assert_ne!(cipher.seal(vec![9; 32]).await.unwrap(), sealed);

        let other = AeadKeyCipher::new(&[8; 32]).unwrap();
        assert!(other.open(sealed.clone()).await.is_err());
        let mut tampered = sealed;
        *tampered.last_mut().unwrap() ^= 1;
        assert!(cipher.open(tampered).await.is_err());
        assert!(AeadKeyCipher::new(&[0; 31]).is_err());
    }

    struct Xor;

    #[async_trait::async_trait]
    impl KeyCipher for Xor {
        async fn seal(&self, key: Vec<u8>) -> Result<Vec<u8>, SdkError> {
            Ok(key.iter().map(|b| b ^ 0xaa).collect())
        }
        async fn open(&self, sealed: Vec<u8>) -> Result<Vec<u8>, SdkError> {
            self.seal(sealed).await
        }
    }

    #[tokio::test]
    async fn vault_seals_with_cipher() {
        let kp = KeyPair::generate().unwrap();
        let vault = KeyVault::new(Some(Arc::new(Xor)));
        let sealed = vault.seal(&kp).await.unwrap();
        assert!(matches!(&sealed, StoredPrivateKey::Sealed(b) if b.as_slice() != kp.seed()));
        let opened = vault.open(1, &sealed).await.unwrap();
        assert_eq!(opened.public_key(), kp.public_key());

        let plain = KeyVault::default();
        assert!(
            plain.open(1, &sealed).await.is_err() || {
                // Without a cipher a sealed key can't be opened.
                false
            }
        );
        let inline = plain.seal(&kp).await.unwrap();
        assert_eq!(inline, StoredPrivateKey::Inline(kp.seed().to_vec()));
    }
}
