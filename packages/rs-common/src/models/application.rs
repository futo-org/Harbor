use crate::models::protos_v2::Application;
use crate::models::validation::{StringValidationError, Validate, validate_string};

impl Validate for Application {
    type Error = ApplicationValidationError;

    fn validate(&self) -> Result<(), Self::Error> {
        let Application {
            name,
            id,
            version,
            url,
        } = self;
        validate_string(name, Some(1), Some(200)).map_err(ApplicationValidationError::Name)?;
        validate_string(id, Some(1), Some(200)).map_err(ApplicationValidationError::Id)?;
        validate_string(version, Some(1), Some(200))
            .map_err(ApplicationValidationError::Version)?;
        validate_string(url, Some(1), Some(200)).map_err(ApplicationValidationError::Url)?;
        Ok(())
    }
}

pub enum ApplicationValidationError {
    Name(StringValidationError),
    Id(StringValidationError),
    Version(StringValidationError),
    Url(StringValidationError),
}
