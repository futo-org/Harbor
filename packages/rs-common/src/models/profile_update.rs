use std::fmt;

use crate::models::image_set;
use crate::models::protos_v2::ProfileUpdate;
use crate::models::validate::{self, StringConfig, StringError, Validate};

impl Validate for ProfileUpdate {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let ProfileUpdate {
            name,
            avatar,
            banner,
            description,
            alias,
        } = self;
        if let Some(name) = name.as_deref() {
            validate::string(
                name,
                errors,
                |err| map_err(ValidationError::Name(err)),
                StringConfig {
                    max_len: Some(50),
                    ..Default::default()
                },
            )
        }
        if let Some(avatar) = avatar.as_ref() {
            avatar.validate_check(errors, |err| map_err(ValidationError::Avatar(err)))
        }
        if let Some(banner) = banner.as_ref() {
            banner.validate_check(errors, |err| map_err(ValidationError::Banner(err)))
        }
        if let Some(description) = description.as_deref() {
            validate::string(
                description,
                errors,
                |err| map_err(ValidationError::Description(err)),
                StringConfig {
                    max_len: Some(160),
                    ..Default::default()
                },
            )
        }
        if let Some(alias) = alias.as_deref() {
            validate::string(
                alias,
                errors,
                |err| map_err(ValidationError::Alias(err)),
                StringConfig {
                    max_len: Some(100),
                    ..Default::default()
                },
            )
        }
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
#[cfg_attr(feature = "uniffi", uniffi(name = "ProfileUpdateValidationError"))]
pub enum ValidationError {
    Name(StringError),
    Avatar(image_set::ValidationError),
    Banner(image_set::ValidationError),
    Description(StringError),
    Alias(StringError),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Name(err) => write!(f, "name {err}"),
            ValidationError::Avatar(err) => write!(f, "avatar {err}"),
            ValidationError::Banner(err) => write!(f, "banner {err}"),
            ValidationError::Description(err) => write!(f, "description {err}"),
            ValidationError::Alias(err) => write!(f, "alias {err}"),
        }
    }
}
