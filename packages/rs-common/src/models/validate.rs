//! Validation

use std::fmt;
use std::sync::OnceLock;

use regex::Regex;

use crate::models::{
    application, attributed_to, attributed_to_reaction, blob, block, content, content_body,
    content_digest, delete, event, event_key, event_proof_target, field_def, follow, identity,
    image, image_set, labels, link, post, post_reply, profile_update, public_key, reaction, report,
    repost, revocation_bound, serialized_verification_schema, server_list, to, vector_clock,
    verification_claim, verification_schema, verification_target, verification_verify,
};

/// Validate a value.
pub trait Validate {
    type Error: Into<ValidationError>;

    /// Validate a value, returning all errors.
    fn validate(&self) -> Result<(), Vec<Self::Error>> {
        let mut errors = Vec::new();
        self.validate_check(&mut errors, std::convert::identity);
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    /// Validate a value, collecting the errors in `errors` using `map_err` to
    /// convert them to a single type.
    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E;
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
    VectorClock(vector_clock::ValidationError),
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
    Delete(delete::ValidationError),
    Follow(follow::ValidationError),
    Block(block::ValidationError),
    Reaction(reaction::ValidationError),
    AttributedToReaction(attributed_to_reaction::ValidationError),
    ProfileUpdate(profile_update::ValidationError),
    Identity(identity::ValidationError),
    RevocationBound(revocation_bound::ValidationError),
    EventProofTarget(event_proof_target::ValidationError),
    ServerList(server_list::ValidationError),
    Repost(repost::ValidationError),
    Report(report::ValidationError),
    Labels(labels::ValidationError),
    VerificationClaim(verification_claim::ValidationError),
    SerializedVerificationSchema(serialized_verification_schema::ValidationError),
    VerificationSchema(verification_schema::ValidationError),
    FieldDef(field_def::ValidationError),
    VerificationVerify(verification_verify::ValidationError),
    VerificationTarget(verification_target::ValidationError),
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

impl From<vector_clock::ValidationError> for ValidationError {
    fn from(err: vector_clock::ValidationError) -> ValidationError {
        ValidationError::VectorClock(err)
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

impl From<delete::ValidationError> for ValidationError {
    fn from(err: delete::ValidationError) -> ValidationError {
        ValidationError::Delete(err)
    }
}

impl From<follow::ValidationError> for ValidationError {
    fn from(err: follow::ValidationError) -> ValidationError {
        ValidationError::Follow(err)
    }
}

impl From<block::ValidationError> for ValidationError {
    fn from(err: block::ValidationError) -> ValidationError {
        ValidationError::Block(err)
    }
}

impl From<reaction::ValidationError> for ValidationError {
    fn from(err: reaction::ValidationError) -> ValidationError {
        ValidationError::Reaction(err)
    }
}

impl From<attributed_to_reaction::ValidationError> for ValidationError {
    fn from(err: attributed_to_reaction::ValidationError) -> ValidationError {
        ValidationError::AttributedToReaction(err)
    }
}

impl From<profile_update::ValidationError> for ValidationError {
    fn from(err: profile_update::ValidationError) -> ValidationError {
        ValidationError::ProfileUpdate(err)
    }
}

impl From<identity::ValidationError> for ValidationError {
    fn from(err: identity::ValidationError) -> ValidationError {
        ValidationError::Identity(err)
    }
}

impl From<revocation_bound::ValidationError> for ValidationError {
    fn from(err: revocation_bound::ValidationError) -> ValidationError {
        ValidationError::RevocationBound(err)
    }
}

impl From<event_proof_target::ValidationError> for ValidationError {
    fn from(err: event_proof_target::ValidationError) -> ValidationError {
        ValidationError::EventProofTarget(err)
    }
}

impl From<server_list::ValidationError> for ValidationError {
    fn from(err: server_list::ValidationError) -> ValidationError {
        ValidationError::ServerList(err)
    }
}

impl From<repost::ValidationError> for ValidationError {
    fn from(err: repost::ValidationError) -> ValidationError {
        ValidationError::Repost(err)
    }
}

impl From<report::ValidationError> for ValidationError {
    fn from(err: report::ValidationError) -> ValidationError {
        ValidationError::Report(err)
    }
}

impl From<labels::ValidationError> for ValidationError {
    fn from(err: labels::ValidationError) -> ValidationError {
        ValidationError::Labels(err)
    }
}

impl From<verification_claim::ValidationError> for ValidationError {
    fn from(err: verification_claim::ValidationError) -> ValidationError {
        ValidationError::VerificationClaim(err)
    }
}

impl From<serialized_verification_schema::ValidationError> for ValidationError {
    fn from(err: serialized_verification_schema::ValidationError) -> ValidationError {
        ValidationError::SerializedVerificationSchema(err)
    }
}

impl From<verification_schema::ValidationError> for ValidationError {
    fn from(err: verification_schema::ValidationError) -> ValidationError {
        ValidationError::VerificationSchema(err)
    }
}

impl From<field_def::ValidationError> for ValidationError {
    fn from(err: field_def::ValidationError) -> ValidationError {
        ValidationError::FieldDef(err)
    }
}

impl From<verification_verify::ValidationError> for ValidationError {
    fn from(err: verification_verify::ValidationError) -> ValidationError {
        ValidationError::VerificationVerify(err)
    }
}

impl From<verification_target::ValidationError> for ValidationError {
    fn from(err: verification_target::ValidationError) -> ValidationError {
        ValidationError::VerificationTarget(err)
    }
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Event(err) => write!(f, "event {err}"),
            ValidationError::EventKey(err) => write!(f, "event key {err}"),
            ValidationError::VectorClock(err) => write!(f, "vector clock {err}"),
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
            ValidationError::Delete(err) => write!(f, "delete {err}"),
            ValidationError::Follow(err) => write!(f, "follow {err}"),
            ValidationError::Block(err) => write!(f, "block {err}"),
            ValidationError::Reaction(err) => write!(f, "reaction {err}"),
            ValidationError::AttributedToReaction(err) => write!(f, "attributed to reaction {err}"),
            ValidationError::ProfileUpdate(err) => write!(f, "profile update {err}"),
            ValidationError::Identity(err) => write!(f, "identity {err}"),
            ValidationError::RevocationBound(err) => write!(f, "revoceration bound {err}"),
            ValidationError::EventProofTarget(err) => write!(f, "event proof target {err}"),
            ValidationError::ServerList(err) => write!(f, "server list {err}"),
            ValidationError::Repost(err) => write!(f, "repost {err}"),
            ValidationError::Report(err) => write!(f, "report {err}"),
            ValidationError::Labels(err) => write!(f, "labels {err}"),
            ValidationError::VerificationClaim(err) => write!(f, "verification claim {err}"),
            ValidationError::SerializedVerificationSchema(err) => {
                write!(f, "serialized verification schema {err}")
            }
            ValidationError::VerificationSchema(err) => write!(f, "verification schema {err}"),
            ValidationError::FieldDef(err) => write!(f, "field def {err}"),
            ValidationError::VerificationVerify(err) => write!(f, "verification verify {err}"),
            ValidationError::VerificationTarget(err) => write!(f, "verification target {err}"),
        }
    }
}

/// Validate a string.
pub(crate) fn string<E, F>(input: &str, errors: &mut Vec<E>, map_err: F, config: StringConfig)
where
    F: Fn(StringError) -> E,
{
    let StringConfig {
        min_len,
        max_len,
        regex,
    } = config;
    let length = input.len().try_into().unwrap_or(u32::MAX);
    if let Some(min) = min_len
        && length < min
    {
        let err = StringError::TooShort { length, min };
        errors.push(map_err(err));
    } else if let Some(max) = max_len
        && length > max
    {
        let err = StringError::TooLong { length, max };
        errors.push(map_err(err));
    }
    if let Some(regex) = regex
        && !regex.is_match(input)
    {
        let err = StringError::FailsRegex {
            regex: regex.as_str().to_owned(),
        };
        errors.push(map_err(err));
    }
}

/// Argument to [`validate::string`].
///
/// [`validate::string`]: string()
#[derive(Debug, Default)]
#[non_exhaustive]
pub(crate) struct StringConfig {
    pub(crate) min_len: Option<u32>,
    pub(crate) max_len: Option<u32>,
    pub(crate) regex: Option<&'static Regex>,
}

/// Error returned by [`validate::string`].
///
/// [`validate::string`]: string()
#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
pub enum StringError {
    TooShort { length: u32, min: u32 },
    TooLong { length: u32, max: u32 },
    // NOTE: this should be `'static str`, but uniffi doesn't support that.
    FailsRegex { regex: String },
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
pub(crate) fn int<E, F>(value: i64, errors: &mut Vec<E>, map_err: F, config: IntConfig)
where
    F: Fn(IntError) -> E,
{
    if let Some(min) = config.min
        && value < min
    {
        let err = IntError::TooSmall { value, min };
        errors.push(map_err(err));
    }
    if let Some(max) = config.max
        && value > max
    {
        let err = IntError::TooLarge { value, max };
        errors.push(map_err(err));
    }
}

/// Argument to [`validate::int`].
///
/// [`validate::int`]: int()
#[derive(Debug, Default)]
#[non_exhaustive]
pub(crate) struct IntConfig {
    pub(crate) min: Option<i64>,
    pub(crate) max: Option<i64>,
}

/// Error returned by [`validate::int`].
///
/// [`validate::int`]: int()
#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
pub enum IntError {
    TooSmall { value: i64, min: i64 },
    TooLarge { value: i64, max: i64 },
}

impl fmt::Display for IntError {
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
///
/// Returns true if an error was encountered (and added to `errors`).
pub(crate) fn slice<T, E, F>(
    input: &[T],
    errors: &mut Vec<E>,
    map_err: F,
    config: SliceConfig,
) -> bool
where
    F: Fn(SliceError) -> E,
{
    let mut returned_error = false;
    let length = input.len().try_into().unwrap_or(u32::MAX);
    if let Some(min) = config.min_len
        && length < min
    {
        let err = SliceError::TooShort { length, min };
        errors.push(map_err(err));
        returned_error = true;
    }
    if let Some(max) = config.max_len
        && length > max
    {
        let err = SliceError::TooLong { length, max };
        errors.push(map_err(err));
        returned_error = true;
    }
    returned_error
}

/// Validate a slice with per-item validation.
///
/// Errors in an item are mapped with `map_item_err`, which also gets the
/// item's index. If `validate` is not needed use [`validate::slice`].
///
/// Returns true if an error was encountered (and added to `errors`).
///
/// [`validate::slice`]: slice()
pub(crate) fn slice2<T, E, F, VE, M, V>(
    input: &[T],
    errors: &mut Vec<E>,
    map_err: F,
    map_item_err: M,
    config: SliceConfig,
    validate: V,
) -> bool
where
    F: Fn(SliceError) -> E,
    M: Fn(u32, VE) -> E,
    // Can't use `impl Fn` here (yet), so using `&dyn Fn` for now.
    V: Fn(&T, &mut Vec<E>, &dyn Fn(VE) -> E),
{
    let start_len = errors.len();
    slice(input, errors, map_err, config);
    for (index, item) in input.iter().enumerate() {
        let index = index.try_into().unwrap_or(u32::MAX);
        validate(item, errors, &|err| map_item_err(index, err));
    }
    errors.len() > start_len // Encountered an error.
}

/// Argument to [`validate::slice`].
///
/// [`validate::slice`]: slice()
#[derive(Debug, Default)]
#[non_exhaustive]
pub(crate) struct SliceConfig {
    pub(crate) min_len: Option<u32>,
    pub(crate) max_len: Option<u32>,
}

/// Error returned by [`validate::slice`].
///
/// [`validate::slice`]: slice()
#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
pub enum SliceError {
    TooShort { length: u32, min: u32 },
    TooLong { length: u32, max: u32 },
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

/// Validate an identity.
pub(crate) fn identity<E, F>(identity: &str, errors: &mut Vec<E>, map_err: F)
where
    F: Fn(StringError) -> E,
{
    string(
        identity,
        errors,
        map_err,
        StringConfig {
            min_len: Some(64),
            max_len: Some(64),
            regex: Some(hex_regex()),
            ..Default::default()
        },
    );
}

/// Validate an emoji.
pub(crate) fn emoji<E, F>(emoji: &str, errors: &mut Vec<E>, map_err: F)
where
    F: Fn(StringError) -> E,
{
    string(
        emoji,
        errors,
        map_err,
        StringConfig {
            // According to
            // <https://machs.space/posts/whats-the-max-valid-length-of-an-emoji/>
            // the longest emoji is 35 bytes (rendered as a single symbol), so
            // allow at least that emoji.
            max_len: Some(40),
            ..Default::default()
        },
    );
}

/// Validate an ed25519 signature.
pub(crate) fn ed25519_signature<E, F>(signature: &[u8], errors: &mut Vec<E>, map_err: F)
where
    F: Fn(SliceError) -> E,
{
    slice(
        signature,
        errors,
        map_err,
        SliceConfig {
            min_len: Some(64),
            max_len: Some(64),
            ..Default::default()
        },
    );
}

/// Validate a SHA256 hash.
pub(crate) fn sha256_hash<E, F>(hash: &[u8], errors: &mut Vec<E>, map_err: F)
where
    F: Fn(SliceError) -> E,
{
    slice(
        hash,
        errors,
        map_err,
        SliceConfig {
            min_len: Some(32),
            max_len: Some(32),
            ..Default::default()
        },
    );
}

/// Validate an URL.
pub(crate) fn url<E, F>(url: &str, errors: &mut Vec<E>, map_err: F)
where
    F: Fn(StringError) -> E,
{
    string(
        url,
        errors,
        map_err,
        StringConfig {
            min_len: Some(1),
            max_len: Some(1000),
            regex: Some(url_regex()),
            ..Default::default()
        },
    );
}

/// Regex that checks if the string starts with `http://` or `https://`.
pub(crate) fn url_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new("^https?:\\/\\/").unwrap())
}

/// Regex that checks if the string is hex encoded.
pub(crate) fn hex_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new("^[0-9a-fA-F]+$").unwrap())
}
