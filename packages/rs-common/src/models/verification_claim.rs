use std::fmt;

use prost::Message;

use crate::models::protos_v2::{VerificationClaim, VerificationSchema};
use crate::models::validate::{self, SliceConfig, SliceError, StringConfig, StringError, Validate};
use crate::models::{serialized_verification_schema, verification_schema};

impl Validate for VerificationClaim {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let VerificationClaim { schema, fields } = self;
        let start_errors_len = errors.len();
        if let Some(schema) = schema.as_ref() {
            schema.validate_check(errors, |err| map_err(ValidationError::Schema(err)))
        } else {
            errors.push(map_err(ValidationError::SchemaMissing));
        }
        let mut total_fields_size = 0;
        for (key, value) in fields {
            total_fields_size += key.len();
            total_fields_size += value.len();
            validate::string(
                key,
                errors,
                |err| {
                    map_err(ValidationError::FieldsKey {
                        key: key.clone(),
                        err,
                    })
                },
                // Matches `FieldDef::key` validation.
                StringConfig {
                    min_len: Some(1),
                    max_len: Some(200),
                    ..Default::default()
                },
            );
            validate::slice(
                value,
                errors,
                |err| {
                    map_err(ValidationError::FieldsValue {
                        key: key.clone(),
                        err,
                    })
                },
                SliceConfig {
                    max_len: Some(10000),
                    ..Default::default()
                },
            );
        }
        let total_fields_max = 1000;
        let total_fields = fields.len();
        if total_fields > total_fields_max {
            errors.push(map_err(ValidationError::FieldsTooMany {
                length: total_fields,
                max: total_fields_max,
            }));
        }
        let total_fields_size_max = 1 * 1024 * 1024; // 1 MB.
        if total_fields_size > total_fields_size_max {
            errors.push(map_err(ValidationError::FieldsTooLarge {
                total_length: total_fields_size,
                max: total_fields_size_max,
            }));
        }
        if let Some(schema) = self.schema.as_ref()
            && let Ok(schema) = VerificationSchema::decode(schema.schema_bytes.as_slice())
            // Only when the schema and fields are valid.
            && errors.len() == start_errors_len
        {
            for (key, value) in fields {
                if let Err(error) = schema.validate_field(key, value) {
                    errors.push(map_err(ValidationError::FieldsInvalid {
                        key: key.clone(),
                        error,
                    }));
                }
            }
            for field in schema.fields {
                if field.required && !fields.contains_key(&field.key) {
                    errors.push(map_err(ValidationError::FieldsMissing {
                        key: field.key.clone(),
                    }));
                }
            }
        }
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Schema(serialized_verification_schema::ValidationError),
    SchemaMissing,
    FieldsKey {
        key: String,
        err: StringError,
    },
    FieldsValue {
        key: String,
        err: SliceError,
    },
    FieldsTooMany {
        length: usize,
        max: usize,
    },
    FieldsTooLarge {
        total_length: usize,
        max: usize,
    },
    FieldsInvalid {
        key: String,
        error: verification_schema::FieldValidationError,
    },
    FieldsMissing {
        key: String,
    },
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Schema(err) => write!(f, "schema {err}"),
            ValidationError::SchemaMissing => write!(f, "schema is missing"),
            ValidationError::FieldsKey { key, err } => write!(f, "field '{key}' {err}"),
            ValidationError::FieldsValue { key, err } => write!(f, "field '{key}' value {err}"),
            ValidationError::FieldsTooMany { length, max } => {
                write!(f, "too many fields ({length}), maximum is {max}")
            }
            ValidationError::FieldsTooLarge { total_length, max } => {
                write!(
                    f,
                    "field total size (keys and values) too large ({total_length}), maximum is {max}"
                )
            }
            ValidationError::FieldsInvalid { key, error } => {
                write!(f, "field '{key}' {error}")
            }
            ValidationError::FieldsMissing { key } => {
                write!(f, "field required field '{key}' missing")
            }
        }
    }
}
