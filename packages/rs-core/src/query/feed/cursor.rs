use polycentric_common::models::internal::EventKey;
use polycentric_common::models::protos::{
    EventKey as ProtobufEventKey, FeedCursor as ProtobufFeedCursor,
};
use prost::Message;

/// Feed cursor for pagination
#[derive(Debug, Clone)]
pub struct FeedCursor {
    pub unix_milliseconds: u64,
    pub event_key: Option<EventKey>,
}

impl FeedCursor {
    /// Create a new feed cursor
    pub fn new(unix_milliseconds: u64, event_key: Option<EventKey>) -> Self {
        Self {
            unix_milliseconds,
            event_key,
        }
    }

    /// Decode cursor from protobuf bytes
    pub fn from_bytes(cursor_bytes: &[u8]) -> Option<Self> {
        if cursor_bytes.is_empty() {
            return None;
        }

        let protobuf_cursor = ProtobufFeedCursor::decode(cursor_bytes).ok()?;

        let event_key = protobuf_cursor
            .event_key
            .as_ref()
            .map(|event_key_proto| EventKey {
                system_key_type: event_key_proto.system_key_type,
                system_key: event_key_proto.system_key.clone(),
                process: event_key_proto.process.clone(),
                logical_clock: event_key_proto.logical_clock,
            });

        Some(Self {
            unix_milliseconds: protobuf_cursor.unix_milliseconds,
            event_key,
        })
    }

    /// Encode cursor to protobuf bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        let protobuf_cursor = ProtobufFeedCursor {
            unix_milliseconds: self.unix_milliseconds,
            event_key: self.event_key.as_ref().map(|key| ProtobufEventKey {
                system_key_type: key.system_key_type,
                system_key: key.system_key.clone(),
                process: key.process.clone(),
                logical_clock: key.logical_clock,
            }),
        };

        protobuf_cursor.encode_to_vec()
    }

    /// Check if an event should be included based on this cursor
    pub fn should_include_event(&self, timestamp: u64, event_key: &EventKey) -> bool {
        timestamp < self.unix_milliseconds
            || (timestamp == self.unix_milliseconds
                && *event_key < *self.event_key.as_ref().unwrap_or(event_key))
    }
}
