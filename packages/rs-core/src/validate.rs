use polycentric_common::models::protos_v2::{Content, Event};
use polycentric_common::models::validate::Validate;
use polycentric_common::models::{content, event};
use prost::Message;

use crate::api::CoreError;

/// Validate encoded `Event` bytes.
///
/// If the returned array is empty it means the event is valid, if it's
/// non-empty it means its invalid.
pub fn validate_event(event: Vec<u8>) -> Result<Vec<event::ValidationError>, CoreError> {
    let event = Event::decode(event.as_slice())
        .map_err(|e| CoreError::Decode(format!("Invalid event bytes: {e}")))?;
    // `Event` has an inherent `validate` method that shadows the trait's.
    Ok(Validate::validate(&event).err().unwrap_or_default())
}

/// The problems a server would reject `content` for; empty when it's
/// valid. Check before publishing.
#[uniffi::export]
pub fn validate_content(content: crate::records::Content) -> Vec<content::ValidationError> {
    Content::from(content).validate().err().unwrap_or_default()
}
