//! `set_labels`: forwards a moderator's label decision to the moderation
//! service, which signs and publishes the `Labels` event.

use std::time::Duration;

use common_kafka::FutureRecord;
use polycentric_common::models::moderation_label::ModerationLabel;
use prost::Message;
use rdkafka::message::{Header, OwnedHeaders};
use tonic::Status;

use crate::config;
use crate::service::context::AuthContext;
use crate::service::identity::rpc::common::require_moderator;
use crate::service::proto::{
    LabelRequest, SetLabelsRequest, SetLabelsResponse,
};

/// Kafka topic the moderation service consumes label decisions from.
pub const LABEL_REQUESTS_TOPIC: &str = "label-requests";

pub async fn handle(
    ctx: AuthContext,
    req: SetLabelsRequest,
) -> Result<SetLabelsResponse, Status> {
    require_moderator(&ctx).await?;

    let Some(target) = req.target else {
        return Err(Status::invalid_argument("target is required"));
    };
    if target.signed_by.is_none() {
        return Err(Status::invalid_argument("target signer is required"));
    }
    let mut label_values = Vec::with_capacity(req.label_values.len());
    for value in req.label_values {
        if ModerationLabel::from_value(&value).is_none() {
            return Err(Status::invalid_argument(format!(
                "unknown label: {value}"
            )));
        }
        if !label_values.contains(&value) {
            label_values.push(value);
        }
    }

    let request = LabelRequest {
        target: Some(target.clone()),
        label_values: label_values.clone(),
        requested_by: ctx.identity().to_string(),
    }
    .encode_to_vec();
    let key = target.encode_to_vec();
    let topic = common_kafka::prefixed(LABEL_REQUESTS_TOPIC);

    // Unlike put_events, wait for the broker: the moderator needs to know
    // when the decision did not get through.
    ctx.kafka_producer
        .send(
            FutureRecord::to(&topic)
                .key(&key)
                .payload(&request)
                .headers(OwnedHeaders::new().insert(Header {
                    key: "SOURCE_SERVER",
                    value: Some(config::get().server_name.as_str()),
                })),
            Duration::from_secs(0),
        )
        .await
        .map_err(|(e, _)| {
            tracing::error!(error = %e, "set_labels kafka publish error");
            Status::unavailable("moderation service unavailable")
        })?;

    tracing::info!(
        moderator = ctx.identity(),
        target = ?target,
        labels = ?label_values,
        "label request sent"
    );
    Ok(SetLabelsResponse {})
}
