use std::fmt;

use crate::models::image;
use crate::models::protos_v2::ImageSet;
use crate::models::validate::{self, SliceConfig, SliceError, Validate};

impl Validate for ImageSet {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let ImageSet { images } = self;
        validate::slice2(
            images,
            errors,
            |err| map_err(ValidationError::Images(err)),
            |index, error| map_err(ValidationError::ImagesItem { index, error }),
            SliceConfig {
                max_len: Some(10),
                ..Default::default()
            },
            |image, errors, map_err| image.validate_check(errors, map_err),
        );
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
#[cfg_attr(feature = "uniffi", uniffi(name = "ImageSetValidationError"))]
pub enum ValidationError {
    Images(SliceError),
    ImagesItem {
        index: u32,
        error: image::ValidationError,
    },
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Images(err) => write!(f, "images {err}"),
            ValidationError::ImagesItem { index, error } => write!(f, "images {index}-th {error}"),
        }
    }
}
