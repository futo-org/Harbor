//! Live heads of the authenticated identity (`SubscribeHeads`) via `Query`.

use std::sync::{Arc, Mutex};

use futures::future::Either;
use futures::{StreamExt, stream};
use polycentric_common::models::heads::Heads;
use polycentric_common::models::protos_v2::{
    ListHeadsResponse, SubscribeHeadsRequest, event_sync_service_client::EventSyncServiceClient,
};
use prost::Message;

use crate::client::PolycentricClient;
use crate::query::{QueryClient, QueryKey, QueryObservable, QueryOpts, channel};

#[derive(Clone, Debug, uniffi::Record)]
pub struct SubscribeHeadsArgs {}

/// Highest sequence per (collection, signer) across servers.
fn merge_heads(
    values: &[Vec<u8>],
    _previous: Option<&Vec<u8>>,
    _client: &Arc<Mutex<PolycentricClient>>,
) -> Vec<u8> {
    values
        .iter()
        .filter_map(|v| ListHeadsResponse::decode(v.as_slice()).ok())
        .flat_map(|response| response.heads)
        .collect::<Heads>()
        .to_response()
        .encode_to_vec()
}

/// Streams the merged heads from every server. Servers without live sync
/// (`UNIMPLEMENTED`) are not retried.
pub fn subscribe_heads(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    _args: SubscribeHeadsArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let stream_fn = move |server_url: String| async move {
        let opened = EventSyncServiceClient::new(channel(&server_url).await?)
            .subscribe_heads(SubscribeHeadsRequest {})
            .await;
        let error = move |e: tonic::Status| format!("subscribe_heads [{server_url}]: {e}");
        match opened {
            Ok(response) => Ok(Either::Left(response.into_inner().map(move |item| {
                item.map(|response| response.encode_to_vec())
                    .map_err(&error)
            }))),
            Err(status) if status.code() == tonic::Code::Unimplemented => {
                Ok(Either::Right(stream::pending()))
            }
            Err(status) => Err(error(status)),
        }
    };
    Arc::new(query_client.subscribe(query_key, stream_fn, merge_heads, opts))
}
