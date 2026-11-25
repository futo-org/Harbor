use std::{fmt, str};

use crate::models::field_def;
use crate::models::protos_v2::{FieldKind, VerificationSchema};
use crate::models::validate::{self, SliceConfig, SliceError, StringConfig, StringError, Validate};

impl VerificationSchema {
    pub(crate) fn validate_field(
        &self,
        key: &str,
        value: &[u8],
    ) -> Result<(), FieldValidationError> {
        let field_def = self
            .fields
            .iter()
            .find(|def| def.key == key)
            .ok_or(FieldValidationError::Unknown)?;

        match field_def.kind() {
            FieldKind::Unspecified => {}
            // TODO: use `format` (e.g. url or hex) for validation?
            // TODO: use `regex` for validation? Not sure if it's safe to create
            // a regex from a potential bad actor (relevant for the server).
            FieldKind::String => {
                let value =
                    str::from_utf8(value).map_err(|_| FieldValidationError::StringInvalidUtf8)?;
                if let Some(max) = field_def.max_len
                    && value.len() > max.try_into().unwrap_or(usize::MAX)
                {
                    return Err(FieldValidationError::StringTooLong { max });
                }
            }
            FieldKind::Int => {
                if value.len() != 8 {
                    return Err(FieldValidationError::IntegerInvalid);
                }
            }
            FieldKind::Bool => {
                if !matches!(value, [0b0] | [0b1]) {
                    return Err(FieldValidationError::BooleanInvalid);
                }
            }
            FieldKind::Bytes => {
                if let Some(max) = field_def.max_len
                    && value.len() > max.try_into().unwrap_or(usize::MAX)
                {
                    return Err(FieldValidationError::BytesTooLong { max });
                }
            }
        }
        Ok(())
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
#[cfg_attr(
    feature = "uniffi",
    uniffi(name = "VerificationSchemaFieldValidationError")
)]
pub enum FieldValidationError {
    Unknown,
    StringInvalidUtf8,
    StringTooLong { max: u32 },
    IntegerInvalid,
    BooleanInvalid,
    BytesTooLong { max: u32 },
}

impl fmt::Display for FieldValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FieldValidationError::Unknown => write!(f, "is not part of the schema"),
            FieldValidationError::StringInvalidUtf8 => write!(f, "is not a valid UTF-8 string"),
            FieldValidationError::StringTooLong { max } => {
                write!(f, "is too long according the schema, maximum is {max}")
            }
            FieldValidationError::IntegerInvalid => {
                write!(f, "is incorrectly sized (expected 8 bytes)")
            }
            FieldValidationError::BooleanInvalid => write!(f, "is invalid, expected 0x0 or 0x1"),
            FieldValidationError::BytesTooLong { max } => {
                write!(f, "is too long according the schema, maximum is {max}")
            }
        }
    }
}

impl Validate for VerificationSchema {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let VerificationSchema {
            name,
            description,
            fields,
        } = self;
        validate::string(
            name,
            errors,
            |err| map_err(ValidationError::Name(err)),
            StringConfig {
                max_len: Some(200),
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
        let too_many_fields = validate::slice2(
            fields,
            errors,
            |err| map_err(ValidationError::Fields(err)),
            |index, error| map_err(ValidationError::FieldsItem { index, error }),
            SliceConfig {
                max_len: Some(100),
                ..Default::default()
            },
            |field, errors, map_err| field.validate_check(errors, map_err),
        );
        if !too_many_fields {
            // This is efficient enough if we have less than 100 fields,
            // otherwise we can use something like a set to check this.
            let mut fields = fields.iter();
            while let Some(field) = fields.next() {
                for next_field in fields.clone() {
                    if field.key == next_field.key {
                        errors.push(map_err(ValidationError::FieldsDup {
                            key: field.key.clone(),
                        }));
                    }
                }
            }
        }
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
#[cfg_attr(feature = "uniffi", uniffi(name = "VerificationSchemaValidationError"))]
pub enum ValidationError {
    Name(StringError),
    Description(StringError),
    Fields(SliceError),
    FieldsDup {
        key: String,
    },
    FieldsItem {
        index: u32,
        error: field_def::ValidationError,
    },
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Name(err) => write!(f, "name {err}"),
            ValidationError::Description(err) => write!(f, "description {err}"),
            ValidationError::Fields(err) => write!(f, "fields {err}"),
            ValidationError::FieldsDup { key } => write!(f, "fields duplicate '{key}'"),
            ValidationError::FieldsItem { index, error } => write!(f, "fields {index}-th {error}"),
        }
    }
}
