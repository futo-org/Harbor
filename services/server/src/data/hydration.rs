use std::collections::HashMap;

use polycentric_common::models::protos_v2::EventBundle;

use crate::service::events::tombstone::{
    DeleteTargetEventKey, EventWithContentRow,
};

#[derive(Default)]
pub struct HydrationState {
    pub deletes_by_target: HashMap<DeleteTargetEventKey, Vec<EventBundle>>,
    pub identity_events: Vec<EventWithContentRow>,
    pub profile_events: Vec<EventWithContentRow>,
}
