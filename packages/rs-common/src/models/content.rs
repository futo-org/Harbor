use crate::error::CoreError;
use crate::models::protos_v2::Blob;
use crate::models::protos_v2::content::ContentBody::{Post, ProfileUpdate};
use crate::models::protos_v2::{Content, Identity, content::ContentBody};

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
