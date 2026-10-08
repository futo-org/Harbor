use std::fmt;

use crate::models::protos_v2::Application;
use crate::models::validate::{self, StringConfig, Validate, url_regex};

impl Validate for Application {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let Application {
            name,
            id,
            version,
            url,
        } = self;
        validate::string(
            name,
            errors,
            |err| map_err(ValidationError::Name(err)),
            StringConfig {
                min_len: Some(1),
                max_len: Some(50),
                ..Default::default()
            },
        );
        validate::string(
            id,
            errors,
            |err| map_err(ValidationError::Id(err)),
            StringConfig {
                min_len: Some(1),
                max_len: Some(100),
                ..Default::default()
            },
        );
        validate::string(
            version,
            errors,
            |err| map_err(ValidationError::Version(err)),
            StringConfig {
                min_len: Some(1),
                max_len: Some(50),
                ..Default::default()
            },
        );
        validate::string(
            url,
            errors,
            |err| map_err(ValidationError::Url(err)),
            StringConfig {
                min_len: Some(1),
                max_len: Some(100),
                regex: Some(url_regex()),
                ..Default::default()
            },
        );
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
pub enum ValidationError {
    Name(validate::StringError),
    Id(validate::StringError),
    Version(validate::StringError),
    Url(validate::StringError),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Name(err) => write!(f, "name {err}"),
            ValidationError::Id(err) => write!(f, "id {err}"),
            ValidationError::Version(err) => write!(f, "version {err}"),
            ValidationError::Url(validate::StringError::FailsRegex { .. }) => {
                write!(f, "url is not a valid URL")
            }
            ValidationError::Url(err) => write!(f, "url {err}"),
        }
    }
}
