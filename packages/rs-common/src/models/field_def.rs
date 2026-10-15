use std::fmt;

use crate::models::protos_v2::{FieldDef, FieldKind};
use crate::models::validate::{self, StringConfig, StringError, Validate};

impl Validate for FieldDef {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let FieldDef {
            key,
            kind,
            format,
            required: _,
            description,
            regex,
            max_len: _,
        } = self;
        validate::string(
            key,
            errors,
            |err| map_err(ValidationError::Key(err)),
            StringConfig {
                max_len: Some(200),
                ..Default::default()
            },
        );
        if !FieldKind::is_valid(*kind) && *kind != FieldKind::Unspecified as i32 {
            errors.push(map_err(ValidationError::KindInvalid));
        }
        validate::string(
            format,
            errors,
            |err| map_err(ValidationError::Format(err)),
            StringConfig {
                max_len: Some(100),
                ..Default::default()
            },
        );
        validate::string(
            description,
            errors,
            |err| map_err(ValidationError::Description(err)),
            StringConfig {
                max_len: Some(1000),
                ..Default::default()
            },
        );
        if let Some(regex) = regex.as_deref() {
            validate::string(
                regex,
                errors,
                |err| map_err(ValidationError::Regex(err)),
                StringConfig {
                    max_len: Some(100),
                    ..Default::default()
                },
            );
        }
        // TODO: validate that the regex is valid?
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Key(StringError),
    KindInvalid,
    Format(StringError),
    Description(StringError),
    Regex(StringError),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Key(err) => write!(f, "key {err}"),
            ValidationError::KindInvalid => write!(f, "kind invalid"),
            ValidationError::Format(err) => write!(f, "format {err}"),
            ValidationError::Description(err) => write!(f, "description {err}"),
            ValidationError::Regex(err) => write!(f, "regex {err}"),
        }
    }
}
