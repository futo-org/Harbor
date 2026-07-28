use ::entity::content_model as ContentModel;
use ::entity::content_verification_claim_model as ClaimModel;
use ::entity::content_verification_target_model as TargetModel;
use ::entity::content_verification_verify_model as VerifyModel;
use ::entity::event_model as EventModel;
use polycentric_common::models::collections;
use sea_orm::sea_query::Expr;
use sea_orm::*;
use std::collections::HashSet;

use crate::service::events::TargetEventKey;
use crate::service::events::tombstone::{EventWithContentRow, HasEventKey};
use crate::service::feeds::repository::content_join;

const VERIFICATIONS_COLLECTION: i16 = collections::VERIFICATIONS as i16;

/// Upper bound on rows returned by any single verification query.
const MAX_ROWS: u64 = 200;

/// A verification request: the key of the VerificationTarget event that
/// asked (for tombstone checks) and the key of the claim it references.
#[derive(Debug, Clone)]
pub struct VerificationTargetDto {
    pub target_key: TargetEventKey,
    pub claim_key: TargetEventKey,
}

/// A target/verify event together with the claim key it references, so
/// callers can group verification state per claim.
#[derive(Debug, Clone)]
pub struct VerificationEventDto {
    pub event: EventModel::Model,
    pub content: Option<ContentModel::Model>,
    pub claim_key: TargetEventKey,
}

impl VerificationEventDto {
    pub fn into_row(self) -> EventWithContentRow {
        (self.event, self.content)
    }
}

impl HasEventKey for VerificationEventDto {
    fn event_key(&self) -> TargetEventKey {
        TargetEventKey::of(&self.event)
    }
}

/// `Condition` matching any of `$keys` on a child table's five
/// `claim_event_key_*` columns.
macro_rules! claim_keys_condition {
    ($table:ident, $keys:expr) => {{
        let mut matches_any = Condition::any();
        for key in $keys.iter().take(MAX_ROWS as usize) {
            matches_any = matches_any.add(
                Condition::all()
                    .add(
                        $table::Column::ClaimEventKeyCollection
                            .eq(key.collection),
                    )
                    .add(
                        $table::Column::ClaimEventKeyIdentity
                            .eq(key.identity.as_str()),
                    )
                    .add(
                        $table::Column::ClaimEventKeyPublicKeyType
                            .eq(key.public_key_type),
                    )
                    .add(
                        $table::Column::ClaimEventKeyPublicKey
                            .eq(key.public_key.clone()),
                    )
                    .add(
                        $table::Column::ClaimEventKeySequence.eq(key.sequence),
                    ),
            );
        }
        matches_any
    }};
}

/// The claim's `TargetEventKey` from a child table row's denormalized
/// columns.
macro_rules! claim_key_of {
    ($row:expr) => {
        TargetEventKey {
            collection: $row.claim_event_key_collection,
            identity: $row.claim_event_key_identity,
            public_key_type: $row.claim_event_key_public_key_type,
            public_key: $row.claim_event_key_public_key,
            sequence: $row.claim_event_key_sequence,
        }
    };
}

pub struct Query;

impl Query {
    /// VerificationClaim events published by an identity.
    pub async fn list_claim_events_for_identity(
        db: &DbConn,
        identity: &str,
    ) -> Result<Vec<EventWithContentRow>, DbErr> {
        EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::InnerJoin, content_join())
            .join(JoinType::InnerJoin, claim_join())
            .filter(EventModel::Column::Collection.eq(VERIFICATIONS_COLLECTION))
            .filter(EventModel::Column::Identity.eq(identity))
            .order_by_desc(EventModel::Column::Sequence)
            .limit(MAX_ROWS)
            .all(db)
            .await
    }

    /// VerificationTarget events published by the claims' owners that
    /// reference any of `claim_keys`.
    pub async fn list_target_events_for_claims(
        db: &DbConn,
        claim_keys: &[TargetEventKey],
    ) -> Result<Vec<VerificationEventDto>, DbErr> {
        if claim_keys.is_empty() {
            return Ok(Vec::new());
        }
        let rows = EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::InnerJoin, content_join())
            .and_also_related(TargetModel::Entity)
            .filter(EventModel::Column::Collection.eq(VERIFICATIONS_COLLECTION))
            .filter(claim_keys_condition!(TargetModel, claim_keys))
            // Only the claim owner's own targeting events count.
            .filter(
                Expr::col((EventModel::Entity, EventModel::Column::Identity))
                    .equals((
                        TargetModel::Entity,
                        TargetModel::Column::ClaimEventKeyIdentity,
                    )),
            )
            .order_by_desc(EventModel::Column::Sequence)
            .limit(MAX_ROWS)
            .all(db)
            .await?;

        // A target event naming several identities joins to several target
        // rows; keep each event once.
        let mut seen: HashSet<i64> = HashSet::new();
        Ok(rows
            .into_iter()
            .filter_map(|(event, content, target)| {
                let target = target?;
                if !seen.insert(event.id) {
                    return None;
                }
                Some(VerificationEventDto {
                    event,
                    content,
                    claim_key: claim_key_of!(target),
                })
            })
            .collect())
    }

    /// VerificationVerify events verifying any of `claim_keys`, from any
    /// identity.
    pub async fn list_verify_events_for_claims(
        db: &DbConn,
        claim_keys: &[TargetEventKey],
    ) -> Result<Vec<VerificationEventDto>, DbErr> {
        if claim_keys.is_empty() {
            return Ok(Vec::new());
        }
        let rows = EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::InnerJoin, content_join())
            .and_also_related(VerifyModel::Entity)
            .filter(EventModel::Column::Collection.eq(VERIFICATIONS_COLLECTION))
            .filter(claim_keys_condition!(VerifyModel, claim_keys))
            .order_by_desc(EventModel::Column::Sequence)
            .limit(MAX_ROWS)
            .all(db)
            .await?;

        let mut seen: HashSet<i64> = HashSet::new();
        Ok(rows
            .into_iter()
            .filter_map(|(event, content, verify)| {
                let verify = verify?;
                if !seen.insert(event.id) {
                    return None;
                }
                Some(VerificationEventDto {
                    event,
                    content,
                    claim_key: claim_key_of!(verify),
                })
            })
            .collect())
    }

    /// Verification requests naming `target_identity`, restricted to
    /// targets published by the referenced claim's own owner. Newest first,
    /// tombstones NOT yet filtered.
    pub async fn list_targets_for_identity(
        db: &DbConn,
        target_identity: &str,
    ) -> Result<Vec<VerificationTargetDto>, DbErr> {
        let rows = EventModel::Entity::find()
            .select_also(TargetModel::Entity)
            .join(JoinType::InnerJoin, content_join())
            .join(JoinType::InnerJoin, target_join())
            .filter(EventModel::Column::Collection.eq(VERIFICATIONS_COLLECTION))
            .filter(TargetModel::Column::TargetIdentity.eq(target_identity))
            // Only the claim's own owner can ask for its verification.
            .filter(
                Expr::col((EventModel::Entity, EventModel::Column::Identity))
                    .equals((
                        TargetModel::Entity,
                        TargetModel::Column::ClaimEventKeyIdentity,
                    )),
            )
            .order_by_desc(EventModel::Column::CreatedAt)
            .order_by_desc(EventModel::Column::Id)
            .limit(MAX_ROWS)
            .all(db)
            .await?;
        // The inner join guarantees the target row.
        Ok(rows
            .into_iter()
            .filter_map(|(event, target)| {
                let target = target?;
                Some(VerificationTargetDto {
                    target_key: TargetEventKey::of(&event),
                    claim_key: claim_key_of!(target),
                })
            })
            .collect())
    }

    /// True when the claim's own owner has published a VerificationTarget
    /// naming `target_identity` for `claim_key` — i.e. that identity was
    /// requested to verify the claim.
    pub async fn was_verification_requested(
        db: &DbConn,
        claim_key: &TargetEventKey,
        target_identity: &str,
    ) -> Result<bool, DbErr> {
        let count = EventModel::Entity::find()
            .join(JoinType::InnerJoin, content_join())
            .join(JoinType::InnerJoin, target_join())
            .filter(EventModel::Column::Collection.eq(VERIFICATIONS_COLLECTION))
            .filter(TargetModel::Column::TargetIdentity.eq(target_identity))
            .filter(claim_keys_condition!(
                TargetModel,
                std::slice::from_ref(claim_key)
            ))
            // Only the claim's own owner can ask for its verification.
            .filter(
                Expr::col((EventModel::Entity, EventModel::Column::Identity))
                    .equals((
                        TargetModel::Entity,
                        TargetModel::Column::ClaimEventKeyIdentity,
                    )),
            )
            .count(db)
            .await?;
        Ok(count > 0)
    }

    /// VerificationClaim events matching the given keys exactly. Newest
    /// first by sequence, tombstones NOT yet filtered.
    pub async fn list_claim_events_by_keys(
        db: &DbConn,
        keys: &[TargetEventKey],
    ) -> Result<Vec<EventWithContentRow>, DbErr> {
        if keys.is_empty() {
            return Ok(Vec::new());
        }
        let mut matches_any = Condition::any();
        for key in keys.iter().take(MAX_ROWS as usize) {
            matches_any = matches_any.add(
                Condition::all()
                    .add(EventModel::Column::Collection.eq(key.collection))
                    .add(EventModel::Column::Identity.eq(key.identity.as_str()))
                    .add(
                        EventModel::Column::PublicKeyType
                            .eq(key.public_key_type),
                    )
                    .add(
                        EventModel::Column::PublicKey
                            .eq(key.public_key.clone()),
                    )
                    .add(EventModel::Column::Sequence.eq(key.sequence)),
            );
        }
        EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::InnerJoin, content_join())
            // A target may reference any event key; only claims qualify.
            .join(JoinType::InnerJoin, claim_join())
            .filter(matches_any)
            .order_by_desc(EventModel::Column::Sequence)
            .limit(MAX_ROWS)
            .all(db)
            .await
    }
}

/// Relation joining a content row to its VerificationTarget rows.
fn target_join() -> RelationDef {
    ContentModel::Entity::belongs_to(TargetModel::Entity)
        .from(ContentModel::Column::Id)
        .to(TargetModel::Column::ContentId)
        .into()
}

/// Relation joining a content row to its VerificationClaim row.
fn claim_join() -> RelationDef {
    ContentModel::Entity::belongs_to(ClaimModel::Entity)
        .from(ContentModel::Column::Id)
        .to(ClaimModel::Column::ContentId)
        .into()
}
