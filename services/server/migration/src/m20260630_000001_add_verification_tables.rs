//! Verification tables: claims, targets, and verifier attestations.
//! Hard-coded (not derived from entities) so it stays a fixed snapshot
//! even as the entity definitions evolve. Every `CREATE` is
//! `IF NOT EXISTS` so re-running is a no-op.

use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Five `EventKey` columns (collection, identity, signer, sequence)
/// denormalized inline under the given prefix.
fn event_key_columns(table: &mut TableCreateStatement, prefix: &str) {
    table
        .col(small_integer(Alias::new(format!("{prefix}collection"))))
        .col(string(Alias::new(format!("{prefix}identity"))))
        .col(small_integer(Alias::new(format!(
            "{prefix}public_key_type"
        ))))
        .col(binary(Alias::new(format!("{prefix}public_key"))))
        .col(big_integer(Alias::new(format!("{prefix}sequence"))));
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // verification_schema (deduplicated by digest; referenced by
        // content_verification_claim.schema_digest_*)
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("verification_schema"))
                    .if_not_exists()
                    .col(integer(Alias::new("digest_type")))
                    .col(binary(Alias::new("digest_bytes")))
                    .col(binary(Alias::new("schema_bytes")))
                    .col(json_binary(Alias::new("schema")))
                    .primary_key(
                        Index::create()
                            .col(Alias::new("digest_type"))
                            .col(Alias::new("digest_bytes")),
                    )
                    .to_owned(),
            )
            .await?;

        // content_verification_claim
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("content_verification_claim"))
                    .if_not_exists()
                    .col(big_integer(Alias::new("content_id")).primary_key())
                    .col(integer(Alias::new("schema_digest_type")))
                    .col(binary(Alias::new("schema_digest_bytes")))
                    .col(json_binary(Alias::new("fields")))
                    .to_owned(),
            )
            .await?;

        // content_verification_target
        let mut target = Table::create();
        target
            .table(Alias::new("content_verification_target"))
            .if_not_exists()
            .col(big_integer(Alias::new("content_id")))
            .col(string(Alias::new("target_identity")))
            .primary_key(
                Index::create()
                    .col(Alias::new("content_id"))
                    .col(Alias::new("target_identity")),
            );
        event_key_columns(&mut target, "claim_event_key_");
        manager.create_table(target.to_owned()).await?;
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("content_verification_target_claim_event_key_idx")
                    .table(Alias::new("content_verification_target"))
                    .col(Alias::new("claim_event_key_collection"))
                    .col(Alias::new("claim_event_key_identity"))
                    .col(Alias::new("claim_event_key_public_key_type"))
                    .col(Alias::new("claim_event_key_public_key"))
                    .col(Alias::new("claim_event_key_sequence"))
                    .to_owned(),
            )
            .await?;

        // content_verification_verify
        let mut verify = Table::create();
        verify
            .table(Alias::new("content_verification_verify"))
            .if_not_exists()
            .col(big_integer(Alias::new("content_id")).primary_key());
        event_key_columns(&mut verify, "claim_event_key_");
        manager.create_table(verify.to_owned()).await?;
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("content_verification_verify_claim_event_key_idx")
                    .table(Alias::new("content_verification_verify"))
                    .col(Alias::new("claim_event_key_collection"))
                    .col(Alias::new("claim_event_key_identity"))
                    .col(Alias::new("claim_event_key_public_key_type"))
                    .col(Alias::new("claim_event_key_public_key"))
                    .col(Alias::new("claim_event_key_sequence"))
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for table in [
            "content_verification_verify",
            "content_verification_target",
            "content_verification_claim",
            "verification_schema",
        ] {
            manager
                .drop_table(
                    Table::drop()
                        .if_exists()
                        .table(Alias::new(table))
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }
}
