use crate::error::{CoreError, Error, Result};
use crate::models::protos_v2::Event;
use crate::models::protos_v2::SignedEvent;
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use prost::Message;

impl SignedEvent {
    pub fn verify_signature(&self) -> std::result::Result<(), CoreError> {
        let event = Event::from_bytes(&self.event_bytes[..]).map_err(|e| {
            CoreError::DeserializationError(format!("Unable to deserialize event: {:?}", e))
        })?;

        let key = event.key.ok_or_else(|| {
            CoreError::DeserializationError("Deserialized event has no key".to_owned())
        })?;

        let signed_by = key.signed_by.ok_or_else(|| {
            CoreError::DeserializationError("Event key has no signed_by".to_owned())
        })?;

        // TODO take into account key type

        let public_key_bytes: [u8; 32] = signed_by.key.try_into().map_err(|e: Vec<u8>| {
            CoreError::DeserializationError(format!(
                "Incorrect public key length: expected 32, got {}",
                e.len()
            ))
        })?;

        let public_key =
            ed25519_dalek::VerifyingKey::from_bytes(&public_key_bytes).map_err(|e| {
                CoreError::DeserializationError(format!(
                    "Unable to deserialize system public key: {:?}",
                    e
                ))
            })?;

        let signature_bytes: [u8; 64] =
            self.signature.clone().try_into().map_err(|e: Vec<u8>| {
                CoreError::DeserializationError(format!(
                    "Incorrect signature length: expected 64, got {}",
                    e.len()
                ))
            })?;

        let signature = ed25519_dalek::Signature::from_bytes(&signature_bytes);

        public_key
            .verify_strict(&self.event_bytes, &signature)
            .map_err(|e| CoreError::SignatureError(format!("Invalid signature {:?}", e)))?;

        Ok(())
    }
}

impl Serializable for SignedEvent {
    fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        self.encode(&mut buf)
            .map_err(|e| Error::Platform(PlatformError::SerializationError(e.to_string())))?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        let result = SignedEvent::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))?;

        result
            .verify_signature()
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))?;

        Ok(result)
    }
}
