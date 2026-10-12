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
        validate::slice2(
            label_values,
            errors,
            |err| map_err(ValidationError::LabelValues(err)),
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
                        min_len: Some(1),
                        max_len: Some(200),
                        ..Default::default()
                    },
                );
            },
        )
    }
}

#[derive(Debug)]
pub enum ValidationError {
    EventKey(event_key::ValidationError),
    EventKeyMissing,
    LabelValues(SliceError<StringError>),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::EventKey(err) => write!(f, "event key {err}"),
            ValidationError::EventKeyMissing => write!(f, "event key is missing"),
            ValidationError::LabelValues(err) => write!(f, "label values {err}"),
        }
    }
}
