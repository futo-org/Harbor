use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use polycentric_common::models::protos_v2 as proto;
use serde::{Deserialize, Serialize};
use tonic::Status;

pub mod hydration;
pub mod pipeline;

/// [`PageInfo`] to return to the client, except with our types instead of
/// opaque cursor strings.
///
/// [`PageInfo`]: proto::PageInfo
#[derive(Copy, Clone, Debug, Serialize, Deserialize)]
pub struct PageInfo<SortedBy> {
    pub backward_cursor: Cursor<SortedBy>,
    pub forward_cursor: Cursor<SortedBy>,
    pub has_previous_page: bool,
    pub has_next_page: bool,
}

impl<SortedBy> PageInfo<SortedBy> {
    /// Build the final [`PageInfo`] protobuf message to give the client.
    ///
    /// [`PageInfo`]: proto::PageInfo
    pub fn to_proto(&self) -> Result<proto::PageInfo, Status>
    where
        SortedBy: Serialize,
    {
        let start_cursor = self.backward_cursor.encode()?;
        let end_cursor = self.forward_cursor.encode()?;
        Ok(proto::PageInfo {
            start_cursor,
            end_cursor,
            has_previous_page: self.has_previous_page,
            has_next_page: self.has_next_page,
        })
    }
}

/// Retrieve items in the feed relative to a cursor.
#[derive(Copy, Clone, Debug, Serialize, Deserialize)]
pub enum CursorFilter<SortedBy> {
    Forward(Cursor<SortedBy>),
    Backward(Cursor<SortedBy>),
}

#[derive(Copy, Clone, Debug, Serialize, Deserialize)]
pub enum Cursor<SortedBy> {
    /// Marks the start of the feed.
    ///
    /// Forward queries return the first items and backward queries return
    /// nothing.
    Start,
    /// Marks somewhere in the feed.
    ///
    /// Forward queries return items following this point and backward queries
    /// return items preceding this point.
    Mid(Marker<SortedBy>),
    /// Marks the end of the feed.
    ///
    /// Forward queries return nothing and backward queries return the last
    /// items.
    End,
}

impl<SortedBy> Cursor<SortedBy> {
    pub fn encode(&self) -> Result<String, Status>
    where
        SortedBy: Serialize,
    {
        let bytes = serde_json::to_vec(self).map_err(|e| {
            tracing::error!(error = %e, "encode pagination token");
            Status::internal("internal server error")
        })?;
        Ok(BASE64_STANDARD.encode(bytes))
    }

    pub fn decode(token: &str) -> Result<Cursor<SortedBy>, Status>
    where
        SortedBy: for<'a> Deserialize<'a>,
    {
        let bytes = BASE64_STANDARD.decode(token).map_err(|e| {
            tracing::debug!(error = %e, "decode pagination token");
            Status::invalid_argument("pagination token")
        })?;

        serde_json::from_slice(bytes.as_slice()).map_err(|e| {
            tracing::debug!(error = %e, "decode pagination token");
            Status::invalid_argument("pagination token")
        })
    }
}

/// Exclusive lower/upper bound for a feed query.
#[derive(Copy, Clone, Debug, Serialize, Deserialize)]
pub struct Marker<SortedBy> {
    pub sorted_by: SortedBy,
    /// Event id (`events.id`) to ensure the ordering is always unique.
    pub event_id: i64,
}

impl<SortedBy> Marker<SortedBy> {
    pub fn values(&self) -> (SortedBy, i64)
    where
        SortedBy: Copy,
    {
        (self.sorted_by, self.event_id)
    }
}
