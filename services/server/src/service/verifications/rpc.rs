//! gRPC `VerificationsService` impl.

pub mod list_targeted_verification_claims;
pub mod list_verification_claims;
pub mod list_verification_targets;
pub mod list_verification_verifies;

use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::events::tombstone::{EventWithContentRow, drop_tombstoned};
use crate::service::identity::service::rows_to_bundles;
use crate::service::proofs::service::attach_proofs;
use crate::service::proto::verifications_service_server::{
    VerificationsService, VerificationsServiceServer,
};
use crate::service::proto::{
    ListTargetedVerificationClaimsRequest,
    ListTargetedVerificationClaimsResponse, ListVerificationClaimsRequest,
    ListVerificationClaimsResponse, ListVerificationTargetsRequest,
    ListVerificationTargetsResponse, ListVerificationVerifiesRequest,
    ListVerificationVerifiesResponse, VerificationClaimBundle,
};
use crate::service::verifications::repository::Query as Repository;
use std::collections::HashMap;
use std::sync::Arc;
use tonic::{Request, Response, Status};

pub struct VerificationsServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl VerificationsService for VerificationsServiceImpl {
    async fn list_verification_claims(
        &self,
        request: Request<ListVerificationClaimsRequest>,
    ) -> Result<Response<ListVerificationClaimsResponse>, Status> {
        Ok(Response::new(
            list_verification_claims::handle(&self.ctx, request.into_inner())
                .await?,
        ))
    }

    async fn list_verification_targets(
        &self,
        request: Request<ListVerificationTargetsRequest>,
    ) -> Result<Response<ListVerificationTargetsResponse>, Status> {
        Ok(Response::new(
            list_verification_targets::handle(&self.ctx, request.into_inner())
                .await?,
        ))
    }

    async fn list_verification_verifies(
        &self,
        request: Request<ListVerificationVerifiesRequest>,
    ) -> Result<Response<ListVerificationVerifiesResponse>, Status> {
        Ok(Response::new(
            list_verification_verifies::handle(&self.ctx, request.into_inner())
                .await?,
        ))
    }

    async fn list_targeted_verification_claims(
        &self,
        request: Request<ListTargetedVerificationClaimsRequest>,
    ) -> Result<Response<ListTargetedVerificationClaimsResponse>, Status> {
        Ok(Response::new(
            list_targeted_verification_claims::handle(
                &self.ctx,
                request.into_inner(),
            )
            .await?,
        ))
    }
}

pub fn build_verifications_service(
    ctx: Arc<ServiceContext>,
) -> VerificationsServiceServer<VerificationsServiceImpl> {
    VerificationsServiceServer::new(VerificationsServiceImpl { ctx })
}

/// Wrap each claim with its verification state: the targets and verifies
/// referencing it, tombstone-filtered, with proofs attached throughout.
pub(crate) async fn build_claim_bundles(
    ctx: &ServiceContext,
    claim_rows: Vec<EventWithContentRow>,
) -> Result<Vec<VerificationClaimBundle>, Status> {
    let claim_keys: Vec<TargetEventKey> = claim_rows
        .iter()
        .map(|(e, _)| TargetEventKey::of(e))
        .collect();

    let map_db_err = |e: sea_orm::DbErr| {
        eprintln!("build_claim_bundles db error: {e}");
        Status::internal("internal server error")
    };
    let targets =
        Repository::list_target_events_for_claims(&ctx.db, &claim_keys)
            .await
            .map_err(map_db_err)?;
    let targets = drop_tombstoned(ctx, targets).await?;
    let verifies =
        Repository::list_verify_events_for_claims(&ctx.db, &claim_keys)
            .await
            .map_err(map_db_err)?;
    let verifies = drop_tombstoned(ctx, verifies).await?;

    let mut targets_by_claim: HashMap<
        TargetEventKey,
        Vec<EventWithContentRow>,
    > = HashMap::new();
    for target in targets {
        targets_by_claim
            .entry(target.claim_key.clone())
            .or_default()
            .push(target.into_row());
    }
    let mut verifies_by_claim: HashMap<
        TargetEventKey,
        Vec<EventWithContentRow>,
    > = HashMap::new();
    for verify in verifies {
        verifies_by_claim
            .entry(verify.claim_key.clone())
            .or_default()
            .push(verify.into_row());
    }

    let mut claim_bundles = Vec::with_capacity(claim_rows.len());
    for row in claim_rows {
        let key = TargetEventKey::of(&row.0);
        claim_bundles.push(VerificationClaimBundle {
            claim: rows_to_bundles(vec![row]).pop(),
            targets: rows_to_bundles(
                targets_by_claim.remove(&key).unwrap_or_default(),
            ),
            verifies: rows_to_bundles(
                verifies_by_claim.remove(&key).unwrap_or_default(),
            ),
        });
    }

    for bundle in &mut claim_bundles {
        if let Some(claim) = bundle.claim.as_mut() {
            attach_proofs(ctx, std::slice::from_mut(claim)).await?;
        }
        attach_proofs(ctx, &mut bundle.targets).await?;
        attach_proofs(ctx, &mut bundle.verifies).await?;
    }
    Ok(claim_bundles)
}
#[cfg(test)]
pub(crate) mod tests {
    use crate::service::context::ServiceContext;
    use crate::service::proto::content::ContentBody;
    use crate::service::proto::{
        Content, EventKey, PublicKey, VerificationClaim, VerificationTarget,
        VerificationVerify,
    };
    use ::entity::content_model as ContentModel;
    use ::entity::content_verification_target_model as TargetModel;
    use ::entity::content_verification_verify_model as VerifyModel;
    use ::entity::event_model as EventModel;
    use polycentric_common::models::collections;
    use prost::Message as _;
    use sea_orm::prelude::TimeDateTimeWithTimeZone;
    use sea_orm::{
        DatabaseConnection, EntityTrait, IdenStatic, IntoMockRow, Iterable,
        MockRow, ModelTrait, SelectA, SelectB, SelectC, Value,
    };
    use std::collections::BTreeMap;
    use std::sync::Arc;

    pub(crate) async fn ctx(db: DatabaseConnection) -> Arc<ServiceContext> {
        let kafka_producer = common_kafka::build_producer()
            .await
            .expect("failed to build Kafka producer");
        ServiceContext::new(db, kafka_producer)
    }

    fn ts(seconds: i64) -> TimeDateTimeWithTimeZone {
        TimeDateTimeWithTimeZone::from_unix_timestamp(seconds).unwrap()
    }

    /// The claim EventKey every fixture references.
    pub(crate) fn claim_event_key(identity: &str) -> EventKey {
        EventKey {
            collection: collections::VERIFICATIONS,
            identity: identity.to_string(),
            signed_by: Some(PublicKey {
                key_type: 1,
                key: vec![0xaa],
            }),
            sequence: 7,
        }
    }

    pub(crate) fn event_row(id: i64, identity: &str) -> EventModel::Model {
        EventModel::Model {
            id,
            collection: collections::VERIFICATIONS as i16,
            identity: identity.to_string(),
            public_key_type: 1,
            public_key: vec![0xaa],
            sequence: id,
            content_digest_type: Some(1),
            content_digest_bytes: Some(vec![id as u8]),
            signature: vec![id as u8],
            previous_signature: vec![],
            previous_root: vec![],
            event_bytes: vec![id as u8],
            created_at: ts(id),
            synced_at: ts(id),
        }
    }

    fn content_row(id: i64, content: Content) -> ContentModel::Model {
        ContentModel::Model {
            id,
            digest_type: 1,
            digest_bytes: vec![id as u8],
            serialized_bytes: content.encode_to_vec(),
            synced_at: ts(id),
        }
    }

    fn target_table_model(
        id: i64,
        owner: &str,
        target: &str,
    ) -> TargetModel::Model {
        TargetModel::Model {
            content_id: id,
            target_identity: target.to_string(),
            claim_event_key_collection: collections::VERIFICATIONS as i16,
            claim_event_key_identity: owner.to_string(),
            claim_event_key_public_key_type: 1,
            claim_event_key_public_key: vec![0xaa],
            claim_event_key_sequence: 7,
        }
    }

    /// A row of the three-entity queries; MockDatabase has no built-in
    /// support for model triples.
    fn three_model_row<M, N, O>(a: M, b: N, c: O) -> MockRow
    where
        M: ModelTrait,
        N: ModelTrait,
        O: ModelTrait,
    {
        let mut row: BTreeMap<String, Value> = BTreeMap::new();
        for column in <<M as ModelTrait>::Entity as EntityTrait>::Column::iter()
        {
            row.insert(
                format!("{}{}", SelectA.as_str(), column.as_str()),
                a.get(column),
            );
        }
        for column in <<N as ModelTrait>::Entity as EntityTrait>::Column::iter()
        {
            row.insert(
                format!("{}{}", SelectB.as_str(), column.as_str()),
                b.get(column),
            );
        }
        for column in <<O as ModelTrait>::Entity as EntityTrait>::Column::iter()
        {
            row.insert(
                format!("{}{}", SelectC.as_str(), column.as_str()),
                c.get(column),
            );
        }
        row.into_mock_row()
    }

    /// Row of the targets query: a VerificationTarget event by `owner`.
    pub(crate) fn target_row(
        id: i64,
        owner: &str,
        targets: &[&str],
    ) -> MockRow {
        let content = Content {
            content_body: Some(ContentBody::VerificationTarget(
                VerificationTarget {
                    claim_event_key: Some(claim_event_key(owner)),
                    target_identities: targets
                        .iter()
                        .map(|s| s.to_string())
                        .collect(),
                },
            )),
        };
        three_model_row(
            event_row(id, owner),
            content_row(id, content),
            target_table_model(id, owner, targets[0]),
        )
    }

    /// Row of the verifies query: a VerificationVerify by `verifier` of
    /// `claim_owner`'s claim.
    pub(crate) fn verify_row(
        id: i64,
        verifier: &str,
        claim_owner: &str,
    ) -> MockRow {
        let content = Content {
            content_body: Some(ContentBody::VerificationVerify(
                VerificationVerify {
                    claim_event_key: Some(claim_event_key(claim_owner)),
                },
            )),
        };
        three_model_row(
            event_row(id, verifier),
            content_row(id, content),
            VerifyModel::Model {
                content_id: id,
                claim_event_key_collection: collections::VERIFICATIONS as i16,
                claim_event_key_identity: claim_owner.to_string(),
                claim_event_key_public_key_type: 1,
                claim_event_key_public_key: vec![0xaa],
                claim_event_key_sequence: 7,
            },
        )
    }

    /// (event, content) row for a VerificationClaim by `owner`. The event
    /// carries the sequence from `claim_event_key` so targets and verifies
    /// built from these fixtures group under it.
    pub(crate) fn claim_row(
        id: i64,
        owner: &str,
    ) -> (EventModel::Model, ContentModel::Model) {
        let content = Content {
            content_body: Some(ContentBody::VerificationClaim(
                VerificationClaim::default(),
            )),
        };
        let mut event = event_row(id, owner);
        event.sequence = claim_event_key(owner).sequence as i64;
        (event, content_row(id, content))
    }

    /// (event, target-table) row for the requests-inbox query.
    pub(crate) fn target_table_row(
        id: i64,
        owner: &str,
        target: &str,
    ) -> (EventModel::Model, TargetModel::Model) {
        (event_row(id, owner), target_table_model(id, owner, target))
    }

    /// Empty result set for any mocked query.
    pub(crate) fn no_rows() -> Vec<MockRow> {
        Vec::new()
    }
}
