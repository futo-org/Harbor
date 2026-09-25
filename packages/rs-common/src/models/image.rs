use std::fmt;

use crate::models::blob;
use crate::models::protos_v2::Image;
use crate::models::validate::Validate;

impl Validate for Image {
    type Error = ValidationError;

    fn validate(&self) -> Result<(), Self::Error> {
        let Image {
            blob,
            width: _, // TODO: maximum dimensions?
            height: _,
        } = self;
        if let Some(blob) = blob {
            blob.validate().map_err(ValidationError::Blob)?;
        } else {
            return Err(ValidationError::BlobMissing);
        }
        Ok(())
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Blob(blob::ValidationError),
    BlobMissing,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Blob(err) => write!(f, "blob {err}"),
            ValidationError::BlobMissing => write!(f, "blob is missing"),
        }
    }
}
