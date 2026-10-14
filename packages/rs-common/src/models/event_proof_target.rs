use std::fmt;

use crate::models::protos_v2::EventProofTarget;
use crate::models::validate::{self, Validate};

impl Validate for EventProofTarget {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let EventProofTarget {
            collection,
            signature,
            root,
            leaf_count,
        } = self;
    }
}

#[derive(Debug)]
pub enum ValidationError {
    // TODO.
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            _ => Ok(()), // TODO.
        }
    }
}
