use crate::models::application::ApplicationValidationError;

pub trait Validate {
    type Error: Into<ValidationError>;

    fn validate(&self) -> Result<(), Self::Error>;
}

pub enum ValidationError {
    Application(ApplicationValidationError),
}

impl From<ApplicationValidationError> for ValidationError {
    fn from(err: ApplicationValidationError) -> ValidationError {
        ValidationError::Application(err)
    }
}

pub(crate) fn validate_string(
    input: &str,
    min_len: Option<usize>,
    max_len: Option<usize>,
) -> Result<(), StringError> {
    let length = input.len();
    if let Some(min) = min_len
        && length < min
    {
        Err(StringError::TooSmall { length, min })
    } else if let Some(max) = max_len
        && length > max
    {
        Err(StringError::TooLarge { length, max })
    } else {
        Ok(())
    }
}

pub enum StringError {
    TooSmall { length: usize, min: usize },
    TooLarge { length: usize, max: usize },
}
