use std::fmt;

use crate::models::protos_v2::{CalendarEventRsvp, CalendarEventRsvpStatus};
use crate::models::validate::Validate;
use crate::models::{collections, event_key};

impl Validate for CalendarEventRsvp {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let CalendarEventRsvp { event_key, status } = self;
        if let Some(event_key) = event_key.as_ref() {
            event_key.validate_check(errors, |err| map_err(ValidationError::EventKey(err)));
            if event_key.collection != collections::CALENDAR {
                errors.push(map_err(ValidationError::EventKey(
                    event_key::ValidationError::CollectionInvalid {
                        expected: collections::CALENDAR,
                    },
                )));
            }
        } else {
            errors.push(map_err(ValidationError::EventKeyMissing));
        }
        if !matches!(
            CalendarEventRsvpStatus::try_from(*status),
            Ok(CalendarEventRsvpStatus::Going
                | CalendarEventRsvpStatus::Maybe
                | CalendarEventRsvpStatus::NotGoing
                | CalendarEventRsvpStatus::Hosting)
        ) {
            errors.push(map_err(ValidationError::StatusInvalid));
        }
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
#[cfg_attr(feature = "uniffi", uniffi(name = "CalendarEventRsvpValidationError"))]
pub enum ValidationError {
    EventKey(event_key::ValidationError),
    EventKeyMissing,
    StatusInvalid,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::EventKey(err) => write!(f, "event key {err}"),
            ValidationError::EventKeyMissing => write!(f, "event key is missing"),
            ValidationError::StatusInvalid => write!(f, "status is invalid"),
        }
    }
}
