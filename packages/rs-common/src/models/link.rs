use std::fmt;

use crate::models::protos_v2::Link;
use crate::models::validate::{self, StringConfig, StringError, Validate};

impl Validate for Link {
    type Error = ValidationError;

    fn validate(&self) -> Result<(), Self::Error> {
        let Link {
            title,
            description,
            image,
            url,
        } = self;
        validate::string(
            title,
            StringConfig {
                min_len: Some(1),
                max_len: Some(100),
                ..Default::default()
            },
        )
        .map_err(ValidationError::Title)?;
        validate::string(
            description,
            StringConfig {
                min_len: Some(1),
                max_len: Some(200),
                ..Default::default()
            },
        )
        .map_err(ValidationError::Description)?;
        validate::string(
            image,
            StringConfig {
                min_len: Some(1),
                max_len: Some(200),
                ..Default::default()
            },
        )
        .map_err(ValidationError::Image)?;
        validate::string(
            url,
            StringConfig {
                min_len: Some(1),
                max_len: Some(200),
                ..Default::default()
            },
        )
        .map_err(ValidationError::Url)?;
        Ok(())
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Title(StringError<'static>),
    Description(StringError<'static>),
    Image(StringError<'static>),
    Url(StringError<'static>),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Title(err) => write!(f, "title {err}"),
            ValidationError::Description(err) => write!(f, "description {err}"),
            ValidationError::Image(err) => write!(f, "image {err}"),
            ValidationError::Url(err) => write!(f, "url {err}"),
        }
    }
}
