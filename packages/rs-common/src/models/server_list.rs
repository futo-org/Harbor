use std::fmt;

use crate::models::protos_v2::ServerList;
use crate::models::validate::{self, SliceConfig, SliceError, StringConfig, StringError, Validate};

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
                max_len: Some(1000),
                ..Default::default()
            },
            |url, errors, map_err| {
                validate::string(
                    url,
                    errors,
                    map_err,
                    StringConfig {
                        min_len: Some(1),
                        max_len: Some(1000),
                        ..Default::default()
                    },
                )
            },
        );
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Urls(SliceError),
    UrlsItem { index: u32, error: StringError },
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Urls(err) => write!(f, "urls {err}"),
            ValidationError::UrlsItem { index, error } => write!(f, "urls {index}-ith {error}"),
        }
    }
}
