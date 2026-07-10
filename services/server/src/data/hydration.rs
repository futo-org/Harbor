use std::collections::HashMap;

use polycentric_common::models::protos_v2::{EventBundle, EventHint};

use crate::service::events::TargetEventKey;
use crate::service::events::tombstone::EventWithContentRow;

#[derive(Default)]
pub struct HydrationState {
    pub deletes_by_target: HashMap<TargetEventKey, Vec<EventBundle>>,
    pub identity_events: Vec<EventWithContentRow>,
    pub profile_events: Vec<EventWithContentRow>,
    pub quote_post_events: Vec<EventWithContentRow>,
    pub repost_events: Vec<EventWithContentRow>,
}

impl HydrationState {
    /// The hydrated identity-chain and profile rows as `EventHint`s, so
    /// clients can validate and render the referenced identities without
    /// extra queries.
    pub fn identity_profile_hints(self) -> Vec<EventHint> {
        crate::service::identity::service::rows_to_hints(
            self.identity_events
                .into_iter()
                .chain(self.profile_events)
                .collect(),
        )
    }
}
