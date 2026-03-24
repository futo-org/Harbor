use crate::error::{CoreError, Error, Result};
use crate::models::Event;
use crate::models::protos::SignedEvent;
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use prost::Message;

impl SignedEvent {
    pub fn verify_signature(&self) -> std::result::Result<(), CoreError> {
        let event = Event::from_bytes(&self.event[..]).map_err(|e| {
            CoreError::DeserializationError(format!("Unable to deserialize event: {:?}", e))
        })?;

        let system = match event.system {
            Some(sys) => Ok(sys),
            None => Err(CoreError::DeserializationError(
                "Deserialized event has no system".to_owned(),
            )),
        }?;

        // TODO take into account key type

        let public_key_bytes: [u8; 32] = system.key.try_into().map_err(|e| {
            CoreError::DeserializationError(format!("Incorrect public key length: {:?}", e))
        })?;

        let public_key =
            ed25519_dalek::VerifyingKey::from_bytes(&public_key_bytes).map_err(|e| {
                CoreError::DeserializationError(format!(
                    "Unable to deserialize system public key: {:?}",
                    e
                ))
            })?;

        let signature_bytes: [u8; 64] = self.signature.clone().try_into().map_err(|e| {
            CoreError::DeserializationError(format!("Incorrect signature length: {:?}", e))
        })?;

        let signature = ed25519_dalek::Signature::from_bytes(&signature_bytes);

        public_key
            .verify_strict(&self.event, &signature)
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
