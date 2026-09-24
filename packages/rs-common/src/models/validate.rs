//! Validation

use std::fmt;
use std::sync::OnceLock;

use regex::Regex;

use crate::models::{application, content_digest, event, event_key, public_key};

/// Validate a value.
pub trait Validate {
    type Error: Into<ValidationError>;

    fn validate(&self) -> Result<(), Self::Error>;
}

/// Collection error for [`Validate`].
///
/// Each implementation of [`Validate`] returns its own error type to reduce the
/// number of variants that the caller has to deal with. This error collects all
/// of those variants in case we don't want handle each variant separately, but
/// only want an error message to return.
#[derive(Debug)]
#[non_exhaustive]
pub enum ValidationError {
    Event(event::ValidationError),
    EventKey(event_key::ValidationError),
    PublicKey(public_key::ValidationError),
    ContentDigest(content_digest::ValidationError),
    Application(application::ValidationError),
}

impl From<event::ValidationError> for ValidationError {
    fn from(err: event::ValidationError) -> ValidationError {
        ValidationError::Event(err)
    }
}

impl From<event_key::ValidationError> for ValidationError {
    fn from(err: event_key::ValidationError) -> ValidationError {
        ValidationError::EventKey(err)
    }
}

impl From<public_key::ValidationError> for ValidationError {
    fn from(err: public_key::ValidationError) -> ValidationError {
        ValidationError::PublicKey(err)
    }
}

impl From<content_digest::ValidationError> for ValidationError {
    fn from(err: content_digest::ValidationError) -> ValidationError {
        ValidationError::ContentDigest(err)
    }
}

impl From<application::ValidationError> for ValidationError {
    fn from(err: application::ValidationError) -> ValidationError {
        ValidationError::Application(err)
    }
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Event(err) => write!(f, "event {err}"),
            ValidationError::EventKey(err) => write!(f, "event key {err}"),
            ValidationError::PublicKey(err) => write!(f, "public key {err}"),
            ValidationError::ContentDigest(err) => write!(f, "content digest {err}"),
            ValidationError::Application(err) => write!(f, "application {err}"),
        }
    }
}

/// Validate a string.
pub(crate) fn string<'r>(input: &str, config: StringConfig<'r>) -> Result<(), StringError<'r>> {
    #[rustfmt::skip]
    let StringConfig { min_len, max_len, regex } = config;
    let length = input.len();
    if let Some(min) = min_len
        && length < min
    {
        Err(StringError::TooShort { length, min })
    } else if let Some(max) = max_len
        && length > max
    {
        Err(StringError::TooLong { length, max })
    } else if let Some(regex) = regex
        && !regex.is_match(input)
    {
        Err(StringError::FailsRegex { regex })
    } else {
        Ok(())
    }
}

/// Argument to [`validate::string`].
///
/// [`validate::string`]: string()
#[derive(Debug, Default)]
#[non_exhaustive]
pub(crate) struct StringConfig<'r> {
    pub(crate) min_len: Option<usize>,
    pub(crate) max_len: Option<usize>,
    pub(crate) regex: Option<&'r Regex>,
}

/// Error returned by [`validate::string`].
///
/// [`validate::string`]: string()
#[derive(Debug)]
pub enum StringError<'r> {
    TooShort { length: usize, min: usize },
    TooLong { length: usize, max: usize },
    FailsRegex { regex: &'r Regex },
}

/// Error message that completes the sentence "${field name} ", e.g. "name is
/// too short".
impl<'r> fmt::Display for StringError<'r> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StringError::TooShort { length: _, min: 1 } => {
                write!(f, "can't be empty")
            }
            StringError::TooShort { length, min } => {
                write!(f, "is too short ({length}), minimum is {min}")
            }
            StringError::TooLong { length, max } => {
                write!(f, "is too long ({length}), maximum is {max}")
            }
            StringError::FailsRegex { regex } => write!(f, "doesn't match the regex '{regex}'"),
        }
    }
}

/// Validate a slice.
pub(crate) fn slice<T>(input: &[T], config: SliceConfig) -> Result<(), SliceError> {
    let length = input.len();
    if let Some(min) = config.min_len
        && length < min
    {
        Err(SliceError::TooShort { length, min })
    } else if let Some(max) = config.max_len
        && length > max
    {
        Err(SliceError::TooLong { length, max })
    } else {
        Ok(())
    }
}

/// Argument to [`validate::slice`].
///
/// [`validate::slice`]: slice()
#[derive(Debug, Default)]
#[non_exhaustive]
pub(crate) struct SliceConfig {
    pub(crate) min_len: Option<usize>,
    pub(crate) max_len: Option<usize>,
}

/// Error returned by [`validate::slice`].
///
/// [`validate::slice`]: slice()
#[derive(Debug)]
pub enum SliceError {
    TooShort { length: usize, min: usize },
    TooLong { length: usize, max: usize },
}

impl fmt::Display for SliceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SliceError::TooShort { length: _, min: 1 } => {
                write!(f, "can't be empty")
            }
            SliceError::TooShort { length, min } => {
                write!(f, "is too short ({length}), minimum is {min}")
            }
            SliceError::TooLong { length, max } => {
                write!(f, "is too long ({length}), maximum is {max}")
            }
        }
    }
}

/// Regex that checks if the input starts with `http://` or `https://`.
pub(crate) fn url_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new("https?:\\/\\/").unwrap())
}
