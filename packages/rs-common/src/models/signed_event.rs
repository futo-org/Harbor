use crate::error::{CoreError, Error, Result};
use crate::models::protos_v2::{Event, SignedEvent};
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use prost::Message;
use std::fmt;

impl SignedEvent {
    /// Verify the signature and then return the decoded event.
    pub fn open(&self) -> std::result::Result<Event, CoreError> {
        let event = Event::from_bytes(&self.event_bytes[..]).map_err(|e| {
            CoreError::DeserializationError(format!("Unable to deserialize event: {:?}", e))
        })?;

        let key = event.key.as_ref().ok_or_else(|| {
            CoreError::DeserializationError("Deserialized event has no key".to_owned())
        })?;

        let signed_by = key.signed_by.as_ref().ok_or_else(|| {
            CoreError::DeserializationError("Event key has no signed_by".to_owned())
        })?;

        if !signed_by.sig_matches(&self.signature, &self.event_bytes) {
            return Err(CoreError::SignatureError(
                "event signature is invalid".to_owned(),
            ));
        }

        Ok(event)
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
            .open()
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))?;

        Ok(result)
    }
}

impl fmt::Debug for SignedEvent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let SignedEvent {
            signature,
            event_bytes,
        } = self;

        let signature = &URL_SAFE_NO_PAD.encode(signature);

        let decoded_event = Event::decode(event_bytes.as_slice()).ok();
        let event: &dyn fmt::Debug = if let Some(event) = decoded_event.as_ref() {
            event
        } else {
            &format_args!("invalid event: {event_bytes:?}")
        };

        f.debug_struct("SignedEvent")
            .field("signature", signature)
            .field("event", event)
            .finish()
    }
}
