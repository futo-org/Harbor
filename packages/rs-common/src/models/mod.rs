pub mod protos {
    include!(concat!(env!("OUT_DIR"), "/polycentric.rs"));
    include!(concat!(env!("OUT_DIR"), "/polycentric_ffi.rs"));
}

// `large_enum_variant`: generated prost oneofs (e.g. Content.ContentBody) hold
// their largest message variant inline; boxing would change the generated API
// at every call site for no real benefit on deserialized-once messages.
#[allow(dead_code, unused_attributes, clippy::large_enum_variant)]
pub mod protos_v2 {
    tonic::include_proto!("polycentric.v2");

    pub const FILE_DESCRIPTOR_SET: &[u8] =
        include_bytes!(concat!(env!("OUT_DIR"), "/polycentric_v2.bin"));
}

pub mod traits;

pub mod application;
pub mod collections;
pub mod content;
pub mod content_digest;
pub mod event;
pub mod event_key;
pub mod identity;
pub mod moderation_label;
pub mod moderation_tag;
pub mod pointer;
pub mod public_key;
pub mod query_engine_stats;
pub mod signed_event;
pub mod signed_issuer_state;
pub mod signed_message;
pub mod vector_clock;

pub use traits::Serializable;

pub use crate::models::protos::*;

pub trait Validate {
    fn validate(&self) -> core::result::Result<(), ValidationError>;
}

pub enum ValidationError {
    /// [`Application::name`].
    ApplicationName(StringValidationError),
    ApplicationId(StringValidationError),
    ApplicationVersion(StringValidationError),
    ApplicationUrl(StringValidationError),
}

fn validate_string(
    input: &str,
    min_len: core::option::Option<usize>,
    max_len: core::option::Option<usize>,
) -> core::result::Result<(), StringValidationError> {
    let length = input.len();
    if let Some(min) = min_len
        && length < min
    {
        Err(StringValidationError::TooSmall { length, min })
    } else if let Some(max) = max_len
        && length > max
    {
        Err(StringValidationError::TooLarge { length, max })
    } else {
        Ok(())
    }
}

pub enum StringValidationError {
    TooSmall { length: usize, min: usize },
    TooLarge { length: usize, max: usize },
}

/*
fn validate_int<Int>(
    input: Int,
    name: impl fmt::Display,
    min_len: Option<Int>,
    max_len: Option<Int>,
) -> Result<(), Status>
where
    Int: Eq + Ord,
{
    if let Some(min_len) = min_len
        && input < min_len
    {
        return Err(Status::invalid_argument(format!("{name} too small")));
    }

    if let Some(max_len) = max_len
        && input > max_len
    {
        return Err(Status::invalid_argument(format!("{name} too large")));
    }

    Ok(())
}

fn validate_slice<T>(
    input: &[T],
    name: impl fmt::Display,
    min_len: Option<usize>,
    max_len: Option<usize>,
    mut validate: impl FnMut(&T) -> Result<(), Status>,
) -> Result<(), Status> {
    if let Some(1) = min_len
        && input.is_empty()
    {
        return Err(Status::invalid_argument(format!("{name} can't be empty")));
    } else if let Some(min_len) = min_len
        && input.len() < min_len
    {
        return Err(Status::invalid_argument(format!("{name} too short")));
    }

    if let Some(max_len) = max_len
        && input.len() > max_len
    {
        return Err(Status::invalid_argument(format!("{name} too long")));
    }

    for item in input {
        validate(item)?;
    }

    Ok(())
}
*/
