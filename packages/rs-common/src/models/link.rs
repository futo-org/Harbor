use std::fmt;

use crate::models::protos_v2::Link;
// TODO: add back.
//use crate::models::validate::{self, StringConfig, StringError};
use crate::models::validate::{StringError, Validate};

impl Validate for Link {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        _ = errors;
        _ = map_err;
        /* TODO: reenable.
        let Link {
            title,
            description,
            image,
            url,
        } = self;
        validate::string(
            title,
            errors,
            |err| map_err(ValidationError::Title(err)),
            StringConfig {
                min_len: Some(1),
                max_len: Some(100),
                ..Default::default()
            },
        );
        if let Some(description) = description.as_deref() {
            validate::string(
                description,
                errors,
                |err| map_err(ValidationError::Description(err)),
                StringConfig {
                    min_len: Some(1),
                    max_len: Some(200),
                    ..Default::default()
                },
            );
        }
        if let Some(image) = image.as_deref() {
            validate::string(
                image,
                errors,
                |err| map_err(ValidationError::Image(err)),
                StringConfig {
                    min_len: Some(1),
                    max_len: Some(200),
                    ..Default::default()
                },
            );
        }
        validate::string(
            url,
            errors,
            |err| map_err(ValidationError::Url(err)),
            StringConfig {
                min_len: Some(1),
                max_len: Some(200),
                ..Default::default()
            },
        );
        */
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Title(StringError),
    Description(StringError),
    Image(StringError),
    Url(StringError),
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
