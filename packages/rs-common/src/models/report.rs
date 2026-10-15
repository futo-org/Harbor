use std::fmt;

use crate::models::event_key;
use crate::models::protos_v2::{Report, ReportCategory};
use crate::models::validate::{self, StringConfig, StringError, Validate};

impl Validate for Report {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let Report {
            event_key,
            category,
            additional_info,
        } = self;
        if let Some(event_key) = event_key {
            event_key.validate_check(errors, |err| map_err(ValidationError::EventKey(err)));
        } else {
            errors.push(map_err(ValidationError::EventKeyMissing));
        }
        if !ReportCategory::is_valid(*category) {
            errors.push(map_err(ValidationError::CategoryInvalid));
        }
        validate::string(
            additional_info,
            errors,
            |err| map_err(ValidationError::AdditionalInfo(err)),
            StringConfig {
                // UI allows it to be empty, though it should probably be optional.
                min_len: None,
                max_len: Some(500),
                ..Default::default()
            },
        );
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
#[cfg_attr(feature = "uniffi", uniffi(name = "ReportValidationError"))]
pub enum ValidationError {
    EventKey(event_key::ValidationError),
    EventKeyMissing,
    CategoryInvalid,
    AdditionalInfo(StringError),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::EventKey(err) => write!(f, "event key {err}"),
            ValidationError::EventKeyMissing => write!(f, "event key is missing"),
            ValidationError::CategoryInvalid => write!(f, "category is invalid"),
            ValidationError::AdditionalInfo(err) => write!(f, "additional info {err}"),
        }
    }
}
