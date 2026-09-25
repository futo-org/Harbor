use std::fmt;

use crate::models::protos_v2::Post;
use crate::models::validate::{self, SliceConfig, SliceError, StringConfig, StringError, Validate};
use crate::models::{attributed_to, event_key, image_set, link, post_reply};

impl Validate for Post {
    type Error = ValidationError;

    fn validate(&self) -> Result<(), Self::Error> {
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
            StringConfig {
                min_len: Some(1),
                max_len: Some(2000),
                ..Default::default()
            },
        )
        .map_err(ValidationError::Text)?;
        if let Some(reply) = reply {
            reply.validate().map_err(ValidationError::Reply)?;
        }
        validate::slice2(
            images,
            SliceConfig {
                max_len: Some(4),
                ..Default::default()
            },
            |image_set| image_set.validate(),
        )
        .map_err(ValidationError::ImageSet)?;
        if let Some(quote) = quote {
            Validate::validate(quote).map_err(ValidationError::Quote)?;
        }
        validate::slice2(
            links,
            SliceConfig {
                max_len: Some(10),
                ..Default::default()
            },
            |link| link.validate(),
        )
        .map_err(ValidationError::Links)?;
        validate::slice2(
            labels,
            SliceConfig {
                max_len: Some(10),
                ..Default::default()
            },
            |label| {
                validate::string(
                    label,
                    StringConfig {
                        min_len: Some(1),
                        max_len: Some(200),
                        ..Default::default()
                    },
                )
            },
        )
        .map_err(ValidationError::Labels)?;
        validate::slice2(
            attributed_to,
            SliceConfig {
                max_len: Some(10),
                ..Default::default()
            },
            |attributed_to| attributed_to.validate(),
        )
        .map_err(ValidationError::AttributedTo)?;
        Ok(())
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
