use polycentric_common::models::application;
use polycentric_common::models::protos_v2::Application;
use polycentric_common::models::validate::Validate;

/// Validate an application.
///
/// If the returned array is empty it means the application is valid, if it's
/// non-empty it means its invalid.
#[uniffi::export]
#[must_use]
pub fn validate_application(application: &Application) -> Vec<application::ValidationError> {
    match application.validate() {
        Ok(()) => Vec::new(),
        Err(errors) => errors,
    }
}
