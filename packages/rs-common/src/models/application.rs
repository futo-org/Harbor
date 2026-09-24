use crate::models::protos_v2::Application;
use crate::models::validation::{self, Validate, string};

impl Validate for Application {
    type Error = ApplicationValidationError;

    fn validate(&self) -> Result<(), Self::Error> {
        let Application {
            name,
            id,
            version,
            url,
        } = self;
        validate::string(name, Some(1), Some(200)).map_err(ApplicationValidationError::Name)?;
        validate::string(id, Some(1), Some(200)).map_err(ApplicationValidationError::Id)?;
        validate::string(version, Some(1), Some(200))
            .map_err(ApplicationValidationError::Version)?;
        validate::string(url, Some(1), Some(200)).map_err(ApplicationValidationError::Url)?;
        Ok(())
    }
}

pub enum ApplicationValidationError {
    Name(validate::StringError),
    Id(validate::StringError),
    Version(validate::StringError),
    Url(validate::StringError),
}
