use std::collections::HashMap;

use polycentric_common::models::protos_v2::EventBundle;

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
