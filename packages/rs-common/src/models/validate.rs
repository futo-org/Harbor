//! Validation

use std::fmt;
use std::sync::OnceLock;

use regex::Regex;

use crate::models::application;

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
    Application(application::ValidationError),
}

impl From<application::ValidationError> for ValidationError {
    fn from(err: application::ValidationError) -> ValidationError {
        ValidationError::Application(err)
    }
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
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

/// Regex that checks if the input starts with `http://` or `https://`.
pub(crate) fn url_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new("https?:\\/\\/").unwrap())
}
