use entity::{content, event, event_proof, identity_document};
use polycentric_common::merkle;
use polycentric_common::models::collections;
use polycentric_common::models::identity::{IdentityCandidate, resolve_chain};
use polycentric_common::models::protos_v2::PublicKey;
use sea_orm::{
    ActiveValue::Set, ColumnTrait, EntityTrait, JoinType, QueryFilter,
    QueryOrder, QuerySelect, RelationDef,
};
use sea_orm_migration::prelude::*;

const IDENTITY_COLLECTION: i16 = collections::IDENTITY as i16;
/// Events read, and proofs written, per query.
const EVENT_PAGE: u64 = 1000;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(
            "CREATE TABLE IF NOT EXISTS identity_document (
                identity TEXT PRIMARY KEY,
                event_id BIGINT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS event_proof (
                event_id BIGINT PRIMARY KEY,
                identity TEXT NOT NULL,
                signature BYTEA NOT NULL,
                target_signature BYTEA NOT NULL,
                leaf_index BIGINT NOT NULL,
                audit_path BYTEA NOT NULL
            );
            CREATE INDEX IF NOT EXISTS event_proof_signature_idx
                ON event_proof (signature);
            CREATE INDEX IF NOT EXISTS event_proof_identity_idx
                ON event_proof (identity);",
        )
        .await?;

        fill(manager).await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(
            "DROP TABLE IF EXISTS event_proof;
            DROP TABLE IF EXISTS identity_document;",
        )
        .await?;

        Ok(())
    }
}

/// Fills both tables for the identities already stored.
async fn fill(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    let db = manager.get_connection();
    let identities: Vec<String> = event::Entity::find()
        .select_only()
        .column(event::Column::Identity)
        .distinct()
        .filter(event::Column::Collection.eq(IDENTITY_COLLECTION))
        .into_tuple()
        .all(db)
        .await?;

    for identity in identities {
        let rows = event::Entity::find()
            .select_also(content::Entity)
            .join(JoinType::InnerJoin, content_join())
            .filter(event::Column::Collection.eq(IDENTITY_COLLECTION))
            .filter(event::Column::Identity.eq(identity.as_str()))
            .order_by_asc(event::Column::Sequence)
            .all(db)
            .await?;
        let candidates = rows.iter().filter_map(|(event, content)| {
            Some(IdentityCandidate {
                event_bytes: &event.event_bytes,
                content_bytes: &content.as_ref()?.serialized_bytes,
                signature: &event.signature,
            })
        });
        let Some(chain) = resolve_chain(&identity, candidates) else {
            continue;
        };
        let Some(head) = chain.latest_event() else {
            continue;
        };
        let Some((head_row, _)) = rows.iter().find(|(event, _)| {
            event.sequence as u64 == head.sequence
                && event.public_key_type as i32 == head.signer.key_type
                && event.public_key == head.signer.key
        }) else {
            continue;
        };
        identity_document::Entity::insert(identity_document::ActiveModel {
            identity: Set(identity.clone()),
            event_id: Set(head_row.id),
        })
        .exec_without_returning(db)
        .await?;

        // Proofs for the events of the keys the document revokes.
        let targets = head.document.revocation_bounds.iter();
        let mut collections: Vec<i32> = targets
            .flat_map(|bound| &bound.targets)
            .map(|target| target.collection)
            .collect();
        collections.sort_unstable();
        collections.dedup();
        for collection in collections {
            // Page through the collection, keeping only what the tree needs.
            let mut ids = Vec::new();
            let mut after = 0;
            let mut events = Vec::new();
            loop {
                let page = event::Entity::find()
                    .filter(event::Column::Collection.eq(collection as i16))
                    .filter(event::Column::Identity.eq(identity.as_str()))
                    .filter(event::Column::Id.gt(after))
                    .order_by_asc(event::Column::Id)
                    .limit(EVENT_PAGE)
                    .all(db)
                    .await?;
                let Some(last) = page.last() else {
                    break;
                };
                after = last.id;
                for event in page {
                    // Events that do not decode are not leaves.
                    let Some(order) = merkle::canonical_key(
                        &event.event_bytes,
                        &event.signature,
                    ) else {
                        continue;
                    };
                    let signer = PublicKey {
                        key_type: event.public_key_type as i32,
                        key: event.public_key,
                    };
                    ids.push(event.id);
                    events.push((signer, order));
                }
            }
            let proofs: Vec<_> =
                merkle::revocation_proofs(&head.document, collection, &events)
                    .into_iter()
                    .map(|(event, proof)| event_proof::ActiveModel {
                        event_id: Set(ids[event]),
                        identity: Set(identity.as_str().to_string()),
                        signature: Set(events[event].1.2.clone()),
                        target_signature: Set(proof.target_signature),
                        leaf_index: Set(proof.leaf_index as i64),
                        audit_path: Set(proof.audit_path.concat()),
                    })
                    .collect();
            for chunk in proofs.chunks(EVENT_PAGE as usize) {
                event_proof::Entity::insert_many(chunk.to_vec())
                    .exec_without_returning(db)
                    .await?;
            }
        }
    }
    Ok(())
}

fn content_join() -> RelationDef {
    event::Entity::belongs_to(content::Entity)
        .from(event::Column::ContentDigestType)
        .to(content::Column::DigestType)
        .on_condition(|event_tbl, content_tbl| {
            Expr::col((event_tbl, event::Column::ContentDigestBytes))
                .equals((content_tbl, content::Column::DigestBytes))
                .into_condition()
        })
        .into()
}
