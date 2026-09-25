use std::fmt;

use crate::models::image;
use crate::models::protos_v2::ImageSet;
use crate::models::validate::{self, SliceConfig, SliceError, Validate};

impl Validate for ImageSet {
    type Error = ValidationError;

    fn validate(&self) -> Result<(), Self::Error> {
        let ImageSet { images } = self;
        validate::slice2(
            images,
            SliceConfig {
                max_len: Some(10),
                ..Default::default()
            },
            |image| image.validate(),
        )
        .map_err(ValidationError::Images)?;
        Ok(())
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Images(SliceError<image::ValidationError>),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Images(err) => write!(f, "images {err}"),
        }
    }
}
