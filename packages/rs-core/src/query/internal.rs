use polycentric_common::models::internal::{ProcessId, SystemKey};
use polycentric_common::models::protos::{ContentType, SignedEvent};
use std::collections::HashMap;

/// Query for latest events by content type
#[derive(Debug, Clone)]
pub struct LatestEventsQuery {
    pub system: SystemKey,
    pub content_type: ContentType,
}

/// Query for process heads
#[derive(Debug, Clone)]
pub struct ProcessHeadsQuery {
    pub system: SystemKey,
}

/// Query for events in a logical clock range
#[derive(Debug, Clone)]
pub struct EventRangeQuery {
    pub system: SystemKey,
    pub process: ProcessId,
    pub start_clock: u64,
    pub end_clock: u64,
}

/// Query for feed events
#[derive(Debug, Clone)]
pub struct FeedQuery {
    pub system: SystemKey,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
    pub limit: Option<usize>,
    pub cursor: Option<Vec<u8>>,
}

/// Query for CRDT values
#[derive(Debug, Clone)]
pub struct CRDTQuery {
    pub system: SystemKey,
    pub content_type: ContentType,
}

/// Result for latest events query
#[derive(Debug)]
pub struct LatestEventsResult {
    pub events: Vec<SignedEvent>,
}

/// Result for process heads query
#[derive(Debug)]
pub struct ProcessHeadsResult {
    pub heads: HashMap<ProcessId, SignedEvent>,
}

/// Result for event range query
#[derive(Debug)]
pub struct EventRangeResult {
    pub events: Vec<SignedEvent>,
}

/// Result for CRDT query operations
#[derive(Debug, Clone)]
pub struct CrdtResult {
    pub value: Option<Vec<u8>>,
    pub missing_data: bool,
}
