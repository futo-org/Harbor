use std::fmt;

use prost::Message;

use crate::error::CoreError;
use crate::models::content_body;
use crate::models::protos_v2::Blob;
use crate::models::protos_v2::content::ContentBody::{Post, ProfileUpdate};
use crate::models::protos_v2::{Content, Identity, SerializedContent, content::ContentBody};
use crate::models::validate::Validate;

impl Content {
    pub fn as_identity(&self) -> Result<&Identity, CoreError> {
        match &self.content_body {
            Some(ContentBody::Identity(i)) => Ok(i),
            _ => Err(CoreError::InvalidEvent("Content is not an Identity".into())),
        }
    }

    /// Gather all of the blobs referenced by this content.
    pub fn blobs(&self) -> Vec<&Blob> {
        let mut blobs = vec![];

        let mut image_sets = vec![];

        if let Some(ref body) = self.content_body {
            match body {
                Post(post) => {
                    image_sets.extend(&post.images);
                }
                ProfileUpdate(update) => {
                    if let Some(ref avatar) = update.avatar {
                        image_sets.push(avatar);
                    }

                    if let Some(ref banner) = update.banner {
                        image_sets.push(banner);
                    }
                }
                _ => {}
            }
        }

        for set in image_sets {
            for image in &set.images {
                if let Some(ref blob) = image.blob {
                    blobs.push(blob);
                }
            }
        }

        blobs
    }
}

impl fmt::Debug for SerializedContent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let SerializedContent { content_bytes } = self;
        let tmp;
        let content: &dyn fmt::Debug = if let Ok(content) = Content::decode(&**content_bytes) {
            tmp = content;
            &tmp
        } else {
            &format_args!("invalid content: {content_bytes:?}")
        };

        f.debug_struct("SerializedContent")
            .field("content", content)
            .finish()
    }
}

impl Validate for Content {
    type Error = ValidationError;

    fn validate(&self) -> Result<(), Self::Error> {
        let Content { content_body } = self;
        if let Some(content_body) = content_body.as_ref() {
            content_body.validate()?;
        } else {
            return Err(ValidationError::ContentBodyMissing);
        }
        Ok(())
    }
}

#[derive(Debug)]
pub enum ValidationError {
    ContentBody(content_body::ValidationError),
    ContentBodyMissing,
}

impl From<content_body::ValidationError> for ValidationError {
    fn from(err: content_body::ValidationError) -> ValidationError {
        ValidationError::ContentBody(err)
    }
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::ContentBody(err) => write!(f, "content body {err}"),
            ValidationError::ContentBodyMissing => write!(f, "content body is missing"),
        }
    }
}
