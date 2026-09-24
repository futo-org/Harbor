use std::sync::OnceLock;

use regex::Regex;

use crate::models::application;

pub trait Validate {
    type Error: Into<ValidationError>;

    fn validate(&self) -> Result<(), Self::Error>;
}

pub enum ValidationError {
    Application(application::ValidationError),
}

impl From<application::ValidationError> for ValidationError {
    fn from(err: application::ValidationError) -> ValidationError {
        ValidationError::Application(err)
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
        Err(StringError::TooSmall { length, min })
    } else if let Some(max) = max_len
        && length > max
    {
        Err(StringError::TooLarge { length, max })
    } else if let Some(regex) = regex
        && !regex.is_match(input)
    {
        Err(StringError::FailsRegex { regex })
    } else {
        Ok(())
    }
}

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
pub enum StringError<'r> {
    TooSmall { length: usize, min: usize },
    TooLarge { length: usize, max: usize },
    FailsRegex { regex: &'r Regex },
}

/// Regex that checks if the input starts with `http://` or `https://`.
pub(crate) fn url_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new("https?:\\/\\/").unwrap())
}
