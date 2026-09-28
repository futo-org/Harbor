use std::fmt;

use crate::models::protos_v2::Post;
use crate::models::validate::{self, SliceConfig, SliceError, StringConfig, StringError, Validate};
use crate::models::{attributed_to, event_key, image_set, link, post_reply};

impl Validate for Post {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let Post {
            text,
            reply,
            images,
            quote,
            links,
            labels,
            attributed_to,
        } = self;
        validate::string(
            text,
            errors,
            |err| map_err(ValidationError::Text(err)),
            StringConfig {
                min_len: Some(1),
                max_len: Some(2000),
                ..Default::default()
            },
        );
        if let Some(reply) = reply {
            reply.validate_check(errors, |err| map_err(ValidationError::Reply(err)));
        }
        validate::slice2(
            images,
            errors,
            |err| map_err(ValidationError::ImageSet(err)),
            SliceConfig {
                max_len: Some(4),
                ..Default::default()
            },
            |image_set, errors, map_err| image_set.validate_check(errors, map_err),
        );
        if let Some(quote) = quote {
            quote.validate_check(errors, |err| map_err(ValidationError::Quote(err)));
        }
        validate::slice2(
            links,
            errors,
            |err| map_err(ValidationError::Links(err)),
            SliceConfig {
                max_len: Some(10),
                ..Default::default()
            },
            |link, errors, map_err| link.validate_check(errors, map_err),
        );
        validate::slice2(
            labels,
            errors,
            |err| map_err(ValidationError::Labels(err)),
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
                )
            },
        );
        validate::slice2(
            attributed_to,
            errors,
            |err| map_err(ValidationError::AttributedTo(err)),
            SliceConfig {
                max_len: Some(10),
                ..Default::default()
            },
            |attributed_to, errors, map_err| attributed_to.validate_check(errors, map_err),
        );
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Text(validate::StringError),
    Reply(post_reply::ValidationError),
    ImageSet(SliceError<image_set::ValidationError>),
    Quote(event_key::ValidationError),
    Links(SliceError<link::ValidationError>),
    Labels(SliceError<StringError>),
    AttributedTo(SliceError<attributed_to::ValidationError>),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Text(err) => write!(f, "text {err}"),
            ValidationError::Reply(err) => write!(f, "reply {err}"),
            ValidationError::ImageSet(err) => write!(f, "image set {err}"),
            ValidationError::Quote(err) => write!(f, "quote {err}"),
            ValidationError::Links(err) => write!(f, "links {err}"),
            ValidationError::Labels(err) => write!(f, "labels {err}"),
            ValidationError::AttributedTo(err) => write!(f, "attributed to {err}"),
        }
    }
}
