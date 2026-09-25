use std::fmt;

use crate::models::protos_v2::Application;
use crate::models::validate::{self, StringConfig, Validate, url_regex};

impl Validate for Application {
    type Error = ValidationError;

    #[rustfmt::skip]
    fn validate(&self) -> Result<(), Self::Error> {
        let Application { name, id, version, url } = self;
        validate::string(name, StringConfig { min_len: Some(1), max_len: Some(50), ..Default::default() }).map_err(ValidationError::Name)?;
        validate::string(id, StringConfig { min_len: Some(1), max_len: Some(100), ..Default::default() }).map_err(ValidationError::Id)?;
        validate::string(version, StringConfig { min_len: Some(1), max_len: Some(50), ..Default::default() }).map_err(ValidationError::Version)?;
        validate::string(url, StringConfig { min_len: Some(1), max_len: Some(100), regex: Some(url_regex()), ..Default::default() }).map_err(ValidationError::Url)?;
        Ok(())
    }
}

#[derive(Debug)]
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
            ValidationError::Url(err) => write!(f, "url {err}"),
        }
    }
}
