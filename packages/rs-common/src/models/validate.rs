//! Validation

use std::fmt;
use std::sync::OnceLock;

use regex::Regex;

use crate::models::{
    application, attributed_to, blob, content, content_body, content_digest, event, event_key,
    image, image_set, link, post, post_reply, public_key, to,
};

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
    Content(content::ValidationError),
    ContentBody(content_body::ValidationError),
    Post(post::ValidationError),
    PostReply(post_reply::ValidationError),
    ImageSet(image_set::ValidationError),
    Image(image::ValidationError),
    Blob(blob::ValidationError),
    Link(link::ValidationError),
    AttributedTo(attributed_to::ValidationError),
    To(to::ValidationError),
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

impl From<content::ValidationError> for ValidationError {
    fn from(err: content::ValidationError) -> ValidationError {
        ValidationError::Content(err)
    }
}

impl From<content_body::ValidationError> for ValidationError {
    fn from(err: content_body::ValidationError) -> ValidationError {
        ValidationError::ContentBody(err)
    }
}

impl From<post::ValidationError> for ValidationError {
    fn from(err: post::ValidationError) -> ValidationError {
        ValidationError::Post(err)
    }
}

impl From<post_reply::ValidationError> for ValidationError {
    fn from(err: post_reply::ValidationError) -> ValidationError {
        ValidationError::PostReply(err)
    }
}

impl From<image_set::ValidationError> for ValidationError {
    fn from(err: image_set::ValidationError) -> ValidationError {
        ValidationError::ImageSet(err)
    }
}

impl From<image::ValidationError> for ValidationError {
    fn from(err: image::ValidationError) -> ValidationError {
        ValidationError::Image(err)
    }
}

impl From<blob::ValidationError> for ValidationError {
    fn from(err: blob::ValidationError) -> ValidationError {
        ValidationError::Blob(err)
    }
}

impl From<link::ValidationError> for ValidationError {
    fn from(err: link::ValidationError) -> ValidationError {
        ValidationError::Link(err)
    }
}

impl From<attributed_to::ValidationError> for ValidationError {
    fn from(err: attributed_to::ValidationError) -> ValidationError {
        ValidationError::AttributedTo(err)
    }
}

impl From<to::ValidationError> for ValidationError {
    fn from(err: to::ValidationError) -> ValidationError {
        ValidationError::To(err)
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
            ValidationError::Content(err) => write!(f, "content {err}"),
            ValidationError::ContentBody(err) => write!(f, "content body {err}"),
            ValidationError::Post(err) => write!(f, "post {err}"),
            ValidationError::PostReply(err) => write!(f, "post reply {err}"),
            ValidationError::ImageSet(err) => write!(f, "image set {err}"),
            ValidationError::Image(err) => write!(f, "image {err}"),
            ValidationError::Blob(err) => write!(f, "blob {err}"),
            ValidationError::Link(err) => write!(f, "link {err}"),
            ValidationError::AttributedTo(err) => write!(f, "attributed to {err}"),
            ValidationError::To(err) => write!(f, "to {err}"),
        }
    }
}

/// Validate a string.
pub(crate) fn string(input: &str, config: StringConfig) -> Result<(), StringError> {
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
pub(crate) struct StringConfig {
    pub(crate) min_len: Option<usize>,
    pub(crate) max_len: Option<usize>,
    pub(crate) regex: Option<&'static Regex>,
}

/// Error returned by [`validate::string`].
///
/// [`validate::string`]: string()
#[derive(Debug)]
pub enum StringError {
    TooShort { length: usize, min: usize },
    TooLong { length: usize, max: usize },
    FailsRegex { regex: &'static Regex },
}

/// Error message that completes the sentence "${field name} ", e.g. "name is
/// too short".
impl fmt::Display for StringError {
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

/// Validate an integer.
pub(crate) fn int<Int>(value: Int, config: IntConfig<Int>) -> Result<(), IntError<Int>>
where
    Int: Eq + Ord,
{
    if let Some(min) = config.min
        && value < min
    {
        Err(IntError::TooSmall { value, min })
    } else if let Some(max) = config.max
        && value > max
    {
        Err(IntError::TooLarge { value, max })
    } else {
        Ok(())
    }
}

/// Argument to [`validate::int`].
///
/// [`validate::int`]: int()
#[derive(Debug, Default)]
#[non_exhaustive]
pub(crate) struct IntConfig<Int> {
    pub(crate) min: Option<Int>,
    pub(crate) max: Option<Int>,
}

/// Error returned by [`validate::int`].
///
/// [`validate::int`]: int()
#[derive(Debug)]
pub enum IntError<Int> {
    TooSmall { value: Int, min: Int },
    TooLarge { value: Int, max: Int },
}

impl<Int: fmt::Display> fmt::Display for IntError<Int> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            IntError::TooSmall { value, min } => {
                write!(f, "is too small ({value}), minimum is {min}")
            }
            IntError::TooLarge { value, max } => {
                write!(f, "is too large ({value}), maximum is {max}")
            }
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

/// Validate a slice with per-item validation.
///
/// If `validate` is not needed use [`validate::slice`].
///
/// [`validate::slice`]: slice()
pub(crate) fn slice2<T, F, E>(
    input: &[T],
    config: SliceConfig,
    validate: F,
) -> Result<(), SliceError<E>>
where
    F: Fn(&T) -> Result<(), E>,
{
    slice(input, config).map_err(|err| match err {
        SliceError::TooShort { length, min } => SliceError::TooShort { length, min },
        SliceError::TooLong { length, max } => SliceError::TooLong { length, max },
    })?;
    for (index, item) in input.iter().enumerate() {
        validate(item).map_err(|error| SliceError::Validate { index, error })?;
    }
    Ok(())
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
pub enum SliceError<E = !> {
    TooShort { length: usize, min: usize },
    TooLong { length: usize, max: usize },
    Validate { index: usize, error: E },
}

impl<E: fmt::Display> fmt::Display for SliceError<E> {
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
            SliceError::Validate { index, error } => {
                write!(f, "{index}-th is invalid: {error}")
            }
        }
    }
}

/// Regex that checks if the input starts with `http://` or `https://`.
pub(crate) fn url_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new("https?:\\/\\/").unwrap())
}
