use crate::models::protos_v2::Application;
use crate::models::{Validate, ValidationError, validate_string};

impl Validate for Application {
    fn validate(&self) -> core::result::Result<(), ValidationError> {
        let Application {
            name,
            id,
            version,
            url,
        } = self;
        validate_string(name, Some(1), Some(200)).map_err(ValidationError::ApplicationName)?;
        validate_string(id, Some(1), Some(200)).map_err(ValidationError::ApplicationId)?;
        validate_string(version, Some(1), Some(200))
            .map_err(ValidationError::ApplicationVersion)?;
        validate_string(url, Some(1), Some(200)).map_err(ValidationError::ApplicationUrl)?;
        Ok(())
    }
}
