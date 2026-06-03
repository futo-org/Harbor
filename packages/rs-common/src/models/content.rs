use crate::error::CoreError;
use crate::models::protos_v2::{Content, Identity, content::ContentBody};

impl Content {
    pub fn as_identity(&self) -> Result<&Identity, CoreError> {
        match &self.content_body {
            Some(ContentBody::Identity(i)) => Ok(i),
            _ => Err(CoreError::InvalidEvent("Content is not an Identity".into())),
        }
    }
}
