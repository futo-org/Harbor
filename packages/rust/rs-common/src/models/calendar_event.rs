use std::fmt;

use crate::models::image_set;
use crate::models::protos_v2::{CalendarEvent, CalendarEventLocation, GeoPoint};
use crate::models::validate::{self, SliceConfig, SliceError, StringConfig, StringError, Validate};

impl Validate for CalendarEvent {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let CalendarEvent {
            id,
            title,
            description,
            start_at,
            end_at,
            location,
            labels,
            all_day: _,
            image,
            timezone,
        } = self;
        validate::string(
            id,
            errors,
            |err| map_err(ValidationError::Id(err)),
            StringConfig {
                min_len: Some(1),
                max_len: Some(200),
                ..Default::default()
            },
        );
        validate::string(
            title,
            errors,
            |err| map_err(ValidationError::Title(err)),
            StringConfig {
                min_len: Some(1),
                max_len: Some(200),
                ..Default::default()
            },
        );
        if let Some(description) = description.as_deref() {
            validate::string(
                description,
                errors,
                |err| map_err(ValidationError::Description(err)),
                StringConfig {
                    max_len: Some(5000),
                    ..Default::default()
                },
            );
        }
        if end_at.is_some_and(|end_at| end_at < *start_at) {
            errors.push(map_err(ValidationError::EndBeforeStart));
        }
        if let Some(location) = location {
            validate_location(location, errors, &map_err);
        }
        validate::slice2(
            labels,
            errors,
            |err| map_err(ValidationError::Labels(err)),
            |index, error| map_err(ValidationError::LabelsItem { index, error }),
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
                )
            },
        );
        if let Some(image) = image {
            image.validate_check(errors, |err| map_err(ValidationError::Image(err)));
        }
        if let Some(timezone) = timezone.as_deref() {
            validate::string(
                timezone,
                errors,
                |err| map_err(ValidationError::Timezone(err)),
                StringConfig {
                    min_len: Some(1),
                    max_len: Some(100),
                    ..Default::default()
                },
            );
        }
    }
}

fn validate_location<E, F>(location: &CalendarEventLocation, errors: &mut Vec<E>, map_err: &F)
where
    F: Fn(ValidationError) -> E,
{
    let CalendarEventLocation {
        name,
        address,
        point,
        url,
    } = location;
    validate::string(
        name,
        errors,
        |err| map_err(ValidationError::LocationName(err)),
        StringConfig {
            max_len: Some(200),
            ..Default::default()
        },
    );
    if let Some(address) = address.as_deref() {
        validate::string(
            address,
            errors,
            |err| map_err(ValidationError::LocationAddress(err)),
            StringConfig {
                max_len: Some(500),
                ..Default::default()
            },
        );
    }
    if let Some(GeoPoint {
        latitude,
        longitude,
    }) = point
    {
        // Range checks also reject NaN
        if !(-90.0..=90.0).contains(latitude) || !(-180.0..=180.0).contains(longitude) {
            errors.push(map_err(ValidationError::LocationPointOutOfRange));
        }
    }
    if let Some(url) = url.as_deref() {
        validate::url(url, errors, |err| {
            map_err(ValidationError::LocationUrl(err))
        });
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
#[cfg_attr(feature = "uniffi", uniffi(name = "CalendarEventValidationError"))]
pub enum ValidationError {
    Id(StringError),
    Title(StringError),
    Description(StringError),
    EndBeforeStart,
    LocationName(StringError),
    LocationAddress(StringError),
    LocationPointOutOfRange,
    LocationUrl(StringError),
    Labels(SliceError),
    LabelsItem { index: u32, error: StringError },
    Image(image_set::ValidationError),
    Timezone(StringError),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Id(err) => write!(f, "id {err}"),
            ValidationError::Title(err) => write!(f, "title {err}"),
            ValidationError::Description(err) => write!(f, "description {err}"),
            ValidationError::EndBeforeStart => write!(f, "end is before start"),
            ValidationError::LocationName(err) => write!(f, "location name {err}"),
            ValidationError::LocationAddress(err) => write!(f, "location address {err}"),
            ValidationError::LocationPointOutOfRange => write!(f, "location point is out of range"),
            ValidationError::LocationUrl(err) => write!(f, "location url {err}"),
            ValidationError::Labels(err) => write!(f, "labels {err}"),
            ValidationError::LabelsItem { index, error } => write!(f, "labels {index}-th {error}"),
            ValidationError::Image(err) => write!(f, "image {err}"),
            ValidationError::Timezone(err) => write!(f, "timezone {err}"),
        }
    }
}
