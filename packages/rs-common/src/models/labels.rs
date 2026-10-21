use std::fmt;

use crate::models::event_key;
use crate::models::protos_v2::Labels;
use crate::models::validate::{self, SliceConfig, SliceError, StringConfig, StringError, Validate};

impl Validate for Labels {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let Labels {
            event_key,
            label_values,
        } = self;
        if let Some(event_key) = event_key {
            event_key.validate_check(errors, |err| map_err(ValidationError::EventKey(err)));
        } else {
            errors.push(map_err(ValidationError::EventKeyMissing));
        }
        // An empty set is valid: the newest `Labels` event for a target is
        // the one in force, so it clears the labels before it.
        validate::slice2(
            label_values,
            errors,
            |err| map_err(ValidationError::LabelValues(err)),
            |index, error| map_err(ValidationError::LabelValuesItem { index, error }),
            SliceConfig {
                max_len: Some(10),
                ..Default::default()
            },
            |label, errors, map_err| {
                validate::string(
                    label,
                    errors,
                    map_err,
                    StringConfig {
                        max_len: Some(200),
                        ..Default::default()
                    },
                );
            },
        );
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
#[cfg_attr(feature = "uniffi", uniffi(name = "LabelsValidationError"))]
pub enum ValidationError {
    EventKey(event_key::ValidationError),
    EventKeyMissing,
    LabelValues(SliceError),
    LabelValuesItem { index: u32, error: StringError },
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::EventKey(err) => write!(f, "event key {err}"),
            ValidationError::EventKeyMissing => write!(f, "event key is missing"),
            ValidationError::LabelValues(err) => write!(f, "label values {err}"),
            ValidationError::LabelValuesItem { index, error } => {
                write!(f, "label values {index}-th {error}")
            }
        }
    }
}
