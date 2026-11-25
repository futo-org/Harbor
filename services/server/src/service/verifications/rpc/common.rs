//! Pipeline stages shared by the verifications RPC handlers, composed
//! with `pipeline::create_pipeline`. Each handler supplies its own `fetch`;
//! `claim_bundles` serves the claim-list RPCs (claims wrapped with their
//! targets and verifies) and `event_list` the flat single-list RPCs.

use tonic::Status;

pub(crate) fn map_db_err(e: sea_orm::DbErr) -> Status {
    tracing::error!(error = %e, "verifications db error");
    Status::internal("internal server error")
}

/// Stages producing `VerificationClaimBundle`s: each claim wrapped with the
/// targets and verifies referencing it.
pub(crate) mod claim_bundles {
    use std::collections::{HashMap, HashSet};

    use entity::{content, event};
    use tonic::Status;

    use crate::data::hydration::{HydrationState, collect_identities};
    use crate::data::{EventWithContentRow, assemble_bundles, row_into_bundle};
    use crate::service::context::RequestContext;
    use crate::service::events::TargetEventKey;
    use crate::service::events::tombstone::{self, HasEventKey};
    use crate::service::feeds::repository::Query as FeedsRepository;
    use crate::service::feeds::rpc::common::has_matching_label;
    use crate::service::identity::service::list_identity_and_profile_events;
    use crate::service::proofs::service::attach_proofs;
    use crate::service::proto::{EventHint, VerificationClaimBundle};
    use crate::service::verifications::repository::{
        Query as Repository, VerificationEventDto,
    };

    use super::map_db_err;

    /// Claim rows together with the verification events that reference them.
    pub(crate) struct FetchedClaims {
        pub claims: Vec<EventWithContentRow>,
        pub targets: Vec<VerificationEventDto>,
        pub verifies: Vec<VerificationEventDto>,
    }

    /// Complete a handler's `fetch` stage: the targets and verifies
    /// referencing `claims`.
    pub(crate) async fn fetch_verification_state<A>(
        ctx: &mut RequestContext<A>,
        claims: Vec<EventWithContentRow>,
    ) -> Result<FetchedClaims, Status> {
        let claim_keys: Vec<TargetEventKey> =
            claims.iter().map(HasEventKey::event_key).collect();

        let targets =
            Repository::list_target_events_for_claims(&mut ctx.db, &claim_keys)
                .await
                .map_err(map_db_err)?;
        let verifies =
            Repository::list_verify_events_for_claims(&mut ctx.db, &claim_keys)
                .await
                .map_err(map_db_err)?;
        Ok(FetchedClaims {
            claims,
            targets,
            verifies,
        })
    }

    /// Validated tombstones for every fetched event (in one lookup), plus
    /// identity-chain and profile events for every referenced identity.
    pub(crate) async fn hydrate<P, A>(
        ctx: &mut RequestContext<A>,
        _: &P,
        fetched: &FetchedClaims,
    ) -> Result<HydrationState, Status> {
        let keys: Vec<TargetEventKey> = fetched
            .claims
            .iter()
            .map(HasEventKey::event_key)
            .chain(fetched.targets.iter().map(HasEventKey::event_key))
            .chain(fetched.verifies.iter().map(HasEventKey::event_key))
            .collect();
        let deletes_by_target =
            tombstone::validated_tombstones(ctx, &keys).await?;

        let identities =
            collect_identities::<(&event::Model, Option<&content::Model>)>(
                fetched
                    .claims
                    .iter()
                    .map(|(event, content)| (event, content.as_ref()))
                    .chain(
                        fetched
                            .targets
                            .iter()
                            .map(|dto| (&dto.event, dto.content.as_ref())),
                    )
                    .chain(
                        fetched
                            .verifies
                            .iter()
                            .map(|dto| (&dto.event, dto.content.as_ref())),
                    ),
            );
        let (identity_events, profile_events) =
            list_identity_and_profile_events(ctx, identities).await?;

        // Labels on the claims and on the profiles, so clients can warn
        // about a labeled claim or cover a labeled name.
        let label_keys: Vec<TargetEventKey> = fetched
            .claims
            .iter()
            .map(HasEventKey::event_key)
            .chain(profile_events.iter().map(|row| TargetEventKey::of(&row.0)))
            .collect();
        let label_events = FeedsRepository::list_labels_for_event_keys(
            &mut ctx.db,
            &label_keys,
        )
        .await
        .map_err(map_db_err)?;

        Ok(HydrationState {
            deletes_by_target,
            identity_events,
            profile_events,
            label_events,
            ..Default::default()
        })
    }

    /// Drop tombstoned claims, targets, and verifies.
    pub(crate) async fn filter<P, A>(
        _: &mut RequestContext<A>,
        _: &P,
        fetched: FetchedClaims,
        hydration: &HydrationState,
    ) -> Result<FetchedClaims, Status> {
        fn live<T: HasEventKey>(
            rows: Vec<T>,
            hydration: &HydrationState,
        ) -> Vec<T> {
            rows.into_iter()
                .filter(|row| {
                    !hydration.deletes_by_target.contains_key(&row.event_key())
                })
                .collect()
        }

        Ok(FetchedClaims {
            claims: live(fetched.claims, hydration),
            targets: live(fetched.targets, hydration),
            verifies: live(fetched.verifies, hydration),
        })
    }

    /// Drop claims carrying a label in `omit_labels`.
    pub(crate) fn drop_omitted(
        mut fetched: FetchedClaims,
        hydration: &HydrationState,
        omit_labels: &[String],
    ) -> FetchedClaims {
        let omit_label_set: HashSet<&str> =
            omit_labels.iter().map(String::as_str).collect();
        fetched.claims.retain(|row| {
            !has_matching_label(
                &hydration.label_events,
                &row.event_key(),
                &omit_label_set,
            )
        });
        fetched
    }

    /// The claim bundles plus identity/profile/label hints.
    pub(crate) struct View {
        pub claim_bundles: Vec<VerificationClaimBundle>,
        pub event_hints: Vec<EventHint>,
    }

    /// Group targets and verifies under their claim, attach proofs, and
    /// ship the hydrated identity/profile/label events as hints.
    pub(crate) async fn view<P, A>(
        ctx: &mut RequestContext<A>,
        _: &P,
        filtered: FetchedClaims,
        hydration: HydrationState,
    ) -> Result<View, Status> {
        let mut targets_by_claim: HashMap<
            TargetEventKey,
            Vec<EventWithContentRow>,
        > = HashMap::new();
        for target in filtered.targets {
            targets_by_claim
                .entry(target.claim_key.clone())
                .or_default()
                .push(target.into_row());
        }
        let mut verifies_by_claim: HashMap<
            TargetEventKey,
            Vec<EventWithContentRow>,
        > = HashMap::new();
        for verify in filtered.verifies {
            verifies_by_claim
                .entry(verify.claim_key.clone())
                .or_default()
                .push(verify.into_row());
        }

        let mut claim_bundles = Vec::with_capacity(filtered.claims.len());
        for row in filtered.claims {
            let key = row.event_key();
            claim_bundles.push(VerificationClaimBundle {
                claim: Some(row_into_bundle(row)),
                targets: assemble_bundles(
                    targets_by_claim.remove(&key).unwrap_or_default(),
                    &hydration.stats,
                ),
                verifies: assemble_bundles(
                    verifies_by_claim.remove(&key).unwrap_or_default(),
                    &hydration.stats,
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
        Ok(View {
            claim_bundles,
            event_hints: hydration.into_hints(),
        })
    }
}

/// Stages producing a flat `EventBundle` list.
pub(crate) mod event_list {
    use tonic::Status;

    use crate::data::hydration::{HydrationState, collect_identities};
    use crate::data::{EventWithContentRow, assemble_bundles};
    use crate::service::context::RequestContext;
    use crate::service::events::TargetEventKey;
    use crate::service::events::tombstone::{self, HasEventKey};
    use crate::service::identity::service::list_identity_and_profile_events;
    use crate::service::proofs::service::attach_proofs;
    use crate::service::proto::{EventBundle, EventHint};

    /// Validated tombstones for the fetched events, plus identity-chain
    /// and profile events for every referenced identity.
    #[allow(clippy::ptr_arg)] // signature must match pipeline's HRTB (&Fetched = &Vec<…>)
    pub(crate) async fn hydrate<P, A>(
        ctx: &mut RequestContext<A>,
        _: &P,
        rows: &Vec<EventWithContentRow>,
    ) -> Result<HydrationState, Status> {
        let keys: Vec<TargetEventKey> =
            rows.iter().map(HasEventKey::event_key).collect();
        let deletes_by_target =
            tombstone::validated_tombstones(ctx, &keys).await?;

        let identities = collect_identities(rows.iter());
        let (identity_events, profile_events) =
            list_identity_and_profile_events(ctx, identities).await?;

        Ok(HydrationState {
            deletes_by_target,
            identity_events,
            profile_events,
            ..Default::default()
        })
    }

    /// Drop tombstoned rows.
    pub(crate) async fn filter<P, A>(
        _: &mut RequestContext<A>,
        _: &P,
        rows: Vec<EventWithContentRow>,
        hydration: &HydrationState,
    ) -> Result<Vec<EventWithContentRow>, Status> {
        Ok(rows
            .into_iter()
            .filter(|row| {
                !hydration.deletes_by_target.contains_key(&row.event_key())
            })
            .collect())
    }

    /// The event bundles plus identity/profile hints.
    pub(crate) struct View {
        pub event_bundles: Vec<EventBundle>,
        pub event_hints: Vec<EventHint>,
    }

    /// Bundle the rows, attach proofs, and ship the hydrated
    /// identity/profile events as hints.
    pub(crate) async fn view<P, A>(
        ctx: &mut RequestContext<A>,
        _: &P,
        rows: Vec<EventWithContentRow>,
        hydration: HydrationState,
    ) -> Result<View, Status> {
        let mut event_bundles = assemble_bundles(rows, &hydration.stats);
        attach_proofs(ctx, &mut event_bundles).await?;
        Ok(View {
            event_bundles,
            event_hints: hydration.identity_profile_hints(),
        })
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use std::collections::BTreeMap;
    use std::sync::Arc;

    use chrono::DateTime;
    use entity::{
        content, content_verification_target, content_verification_verify,
        event,
    };
    use polycentric_common::models::collections;
    use prost::Message;
    use sea_orm::prelude::DateTimeWithTimeZone;
    use sea_orm::{
        DatabaseConnection, DbBackend, EntityTrait, IdenStatic, IntoMockRow,
        Iterable, MockDatabase, MockRow, ModelTrait, SelectA, SelectB, SelectC,
        Value,
    };

    use crate::data::hydration::HydrationState;
    use crate::service::context::ServiceContext;
    use crate::service::proto::content::ContentBody;
    use crate::service::proto::{
        Content, EventKey, Labels, PublicKey, VerificationClaim,
        VerificationTarget, VerificationVerify,
    };
    use crate::service::verifications::rpc::common::claim_bundles;

    #[test]
    fn drop_omitted_drops_claims_with_an_omitted_label() {
        let (alice_event, alice_content) = claim_row(1, "alice");
        let (bob_event, bob_content) = claim_row(2, "bob");
        let fetched = claim_bundles::FetchedClaims {
            claims: vec![
                (alice_event, Some(alice_content)),
                (bob_event, Some(bob_content)),
            ],
            targets: Vec::new(),
            verifies: Vec::new(),
        };
        let hydration = HydrationState {
            label_events: vec![label_row(3, "alice", "violence")],
            ..Default::default()
        };

        let kept = claim_bundles::drop_omitted(
            fetched,
            &hydration,
            &["violence".to_string()],
        );

        let kept_owners: Vec<_> = kept
            .claims
            .iter()
            .map(|(event, _)| event.identity.as_str())
            .collect();
        assert_eq!(kept_owners, vec!["bob"]);
    }

    #[test]
    fn drop_omitted_keeps_claims_whose_labels_are_not_omitted() {
        let (alice_event, alice_content) = claim_row(1, "alice");
        let fetched = claim_bundles::FetchedClaims {
            claims: vec![(alice_event, Some(alice_content))],
            targets: Vec::new(),
            verifies: Vec::new(),
        };
        let hydration = HydrationState {
            label_events: vec![label_row(3, "alice", "violence")],
            ..Default::default()
        };

        let kept = claim_bundles::drop_omitted(
            fetched,
            &hydration,
            &["hate".to_string()],
        );

        assert_eq!(kept.claims.len(), 1);
    }

    /// A moderator label event on `owner`'s claim.
    fn label_row(
        id: i64,
        owner: &str,
        label_value: &str,
    ) -> (event::Model, Option<content::Model>) {
        let label_content = Content {
            content_body: Some(ContentBody::Labels(Labels {
                event_key: Some(claim_event_key(owner)),
                label_values: vec![label_value.to_string()],
            })),
        };
        (
            event_row(id, "moderator"),
            Some(content_row(id, label_content)),
        )
    }

    #[tokio::test]
    async fn claim_bundles_view_ships_label_hints() {
        let db = MockDatabase::new(DbBackend::Postgres).into_connection();
        let mut ctx = ctx(db)
            .await
            .public_rw(&tonic::Request::new(()))
            .await
            .unwrap();
        let (claim_event, claim_content) = claim_row(1, "alice");
        let label_content = Content {
            content_body: Some(ContentBody::Labels(Labels {
                event_key: Some(claim_event_key("alice")),
                label_values: vec!["violence".to_string()],
            })),
        };
        let label_row = (
            event_row(2, "moderator"),
            Some(content_row(2, label_content)),
        );
        let fetched = claim_bundles::FetchedClaims {
            claims: vec![(claim_event, Some(claim_content))],
            targets: Vec::new(),
            verifies: Vec::new(),
        };
        let hydration = HydrationState {
            label_events: vec![label_row],
            ..Default::default()
        };

        let view = claim_bundles::view(&mut ctx, &(), fetched, hydration)
            .await
            .unwrap();

        assert_eq!(view.claim_bundles.len(), 1);
        let hint_event_bytes: Vec<_> = view
            .event_hints
            .iter()
            .map(|hint| {
                hint.event_bundle
                    .as_ref()
                    .unwrap()
                    .signed_event
                    .as_ref()
                    .unwrap()
                    .event_bytes
                    .clone()
            })
            .collect();
        assert_eq!(hint_event_bytes, vec![vec![2]]);
    }

    pub(crate) async fn ctx(db: DatabaseConnection) -> Arc<ServiceContext> {
        ServiceContext::new_test(db).await
    }

    fn ts(seconds: i64) -> DateTimeWithTimeZone {
        DateTime::from_timestamp_secs(seconds)
            .unwrap()
            .fixed_offset()
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

    pub(crate) fn event_row(id: i64, identity: &str) -> event::Model {
        event::Model {
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
            application_id: None,
            event_bytes: vec![id as u8],
            created_at: ts(id),
            synced_at: ts(id),
            content_type: None,
        }
    }

    fn content_row(id: i64, content: Content) -> content::Model {
        content::Model {
            id,
            digest_type: 1,
            digest_bytes: vec![id as u8],
            serialized_bytes: content.encode_to_vec(),
            synced_at: ts(id),
        }
    }

    fn target_table(
        id: i64,
        owner: &str,
        target: &str,
    ) -> content_verification_target::Model {
        content_verification_target::Model {
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
    fn three_row<M, N, O>(a: M, b: N, c: O) -> MockRow
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
        three_row(
            event_row(id, owner),
            content_row(id, content),
            target_table(id, owner, targets[0]),
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
        three_row(
            event_row(id, verifier),
            content_row(id, content),
            content_verification_verify::Model {
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
    ) -> (event::Model, content::Model) {
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
    ) -> (event::Model, content_verification_target::Model) {
        (event_row(id, owner), target_table(id, owner, target))
    }

    /// Empty result set for any mocked query.
    pub(crate) fn no_rows() -> Vec<MockRow> {
        Vec::new()
    }
}
