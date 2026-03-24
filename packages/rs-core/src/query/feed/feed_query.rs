use crate::query::feed::cursor::FeedCursor;
use crate::query::internal::FeedQuery;
use crate::store::EventStore;
use polycentric_common::error::CoreError;
use polycentric_common::models::internal::{EventKey, SystemKey};
use polycentric_common::models::protos::{Event, FeedResult, SignedEvent};
use prost::Message;

/// Feed query engine for handling feed-related queries
#[derive(Debug)]
pub struct FeedQueryEngine;

impl FeedQueryEngine {
    /// Create a new feed query engine
    pub fn new() -> Self {
        Self
    }

    /// Query feed events
    pub fn query_feed(
        &self,
        query: FeedQuery,
        event_store: &EventStore,
    ) -> Result<FeedResult, CoreError> {
        let start_time = query.start_time.unwrap_or(0);
        let end_time = query.end_time.unwrap_or(u64::MAX);
        let limit = query.limit.unwrap_or(usize::MAX);

        let start_cursor = if let Some(cursor_bytes) = &query.cursor {
            FeedCursor::from_bytes(cursor_bytes)
        } else {
            None
        };

        let all_events = event_store.get_events_by_time_range_for_feed(start_time, end_time, None);

        let mut events_with_time: Vec<(SignedEvent, u64, EventKey)> = Vec::new();

        for signed_event in all_events {
            if let Ok(event) = Event::decode(signed_event.event.as_slice()) {
                if let (Some(system), Some(process)) = (&event.system, &event.process) {
                    let event_key = EventKey {
                        system_key_type: system.key_type,
                        system_key: system.key.clone(),
                        process: process.process.clone(),
                        logical_clock: event.logical_clock,
                    };

                    let timestamp = event.unix_milliseconds.unwrap_or(0);
                    events_with_time.push((signed_event.clone(), timestamp, event_key));
                }
            }
        }

        events_with_time.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.2.cmp(&a.2)));

        if let Some(cursor) = &start_cursor {
            events_with_time.retain(|(_, timestamp, event_key)| {
                cursor.should_include_event(*timestamp, event_key)
            });
        }

        let mut result_events = Vec::new();
        let mut cursor_state = None;

        for (i, (signed_event, timestamp, event_key)) in events_with_time.iter().enumerate() {
            if i >= limit {
                // Create cursor for next page
                cursor_state = Some(FeedCursor::new(*timestamp, Some(event_key.clone())));
                break;
            }
            result_events.push(signed_event.clone());
        }

        let cursor_bytes = cursor_state
            .map(|cursor| cursor.to_bytes())
            .unwrap_or_default();

        Ok(FeedResult {
            events: result_events,
            cursor: cursor_bytes,
        })
    }

    /// Query feed events with cursor support (takes raw bytes, returns serialized bytes)
    pub fn query_feed_with_cursor(
        &self,
        system_bytes: &[u8],
        start_time: Option<u64>,
        end_time: Option<u64>,
        limit: Option<usize>,
        cursor: Option<&[u8]>,
        event_store: &EventStore,
    ) -> Result<Vec<u8>, CoreError> {
        let system_key = SystemKey::from_public_key(
            &polycentric_common::models::protos::PublicKey::decode(system_bytes).map_err(|e| {
                CoreError::InvalidEvent(format!("Failed to decode system key: {}", e))
            })?,
        );

        let query = FeedQuery {
            system: system_key,
            start_time,
            end_time,
            limit,
            cursor: cursor.map(|c| c.to_vec()),
        };

        let result = self
            .query_feed(query, event_store)
            .map_err(|e| CoreError::InvalidEvent(format!("Query feed failed: {}", e)))?;

        let feed_result_proto = polycentric_common::models::protos::FeedResult {
            events: result.events,
            cursor: result.cursor,
        };

        Ok(feed_result_proto.encode_to_vec())
    }
}

impl Default for FeedQueryEngine {
    fn default() -> Self {
        Self::new()
    }
}
