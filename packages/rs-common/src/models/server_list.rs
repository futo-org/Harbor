use std::fmt;

use crate::models::protos_v2::ServerList;
use crate::models::validate::{self, SliceConfig, SliceError, StringError, Validate};

impl Validate for ServerList {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let ServerList { urls } = self;
        validate::slice2(
            urls,
            errors,
            |err| map_err(ValidationError::Urls(err)),
            |index, error| map_err(ValidationError::UrlsItem { index, error }),
            SliceConfig {
                max_len: Some(100),
                ..Default::default()
            },
            |url, errors, map_err| validate::url(url, errors, map_err),
        );
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
#[cfg_attr(feature = "uniffi", uniffi(name = "ServerListValidationError"))]
pub enum ValidationError {
    Urls(SliceError),
    UrlsItem { index: u32, error: StringError },
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Urls(err) => write!(f, "urls {err}"),
            ValidationError::UrlsItem { index, error } => write!(f, "urls {index}-th {error}"),
        }
    }
}
