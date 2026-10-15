use std::fmt;

use crate::models::field_def;
use crate::models::protos_v2::VerificationSchema;
use crate::models::validate::{self, SliceConfig, SliceError, StringConfig, StringError, Validate};

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
