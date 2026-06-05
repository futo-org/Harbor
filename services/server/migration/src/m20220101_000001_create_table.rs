//! Initial schema. Hard-coded (not derived from entities) so it is a
//! fixed snapshot that never drifts as the entity definitions evolve, and
//! every `CREATE` is `IF NOT EXISTS` so re-running against a database that
//! already has these objects is a no-op rather than an error.
//!
//! Later migrations layer their deltas on top and are written to be
//! no-ops on a fresh database created by this migration.

use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Five `EventKey` columns (collection, identity, signer, sequence) used
/// inline by several content child tables.
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
        // content (parent of all content child tables)
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("content"))
                    .if_not_exists()
                    .col(
                        big_integer(Alias::new("id"))
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(integer(Alias::new("digest_type")))
                    .col(binary(Alias::new("digest_bytes")))
                    .col(binary(Alias::new("serialized_bytes")))
                    .col(timestamp(Alias::new("synced_at")))
                    .to_owned(),
            )
            .await?;
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx-content-digest")
                    .table(Alias::new("content"))
                    .col(Alias::new("digest_type"))
                    .col(Alias::new("digest_bytes"))
                    .unique()
                    .to_owned(),
            )
            .await?;

        // events
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("events"))
                    .if_not_exists()
                    .col(
                        big_integer(Alias::new("id"))
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(small_integer(Alias::new("collection")))
                    .col(string(Alias::new("identity")))
                    .col(small_integer(Alias::new("public_key_type")))
                    .col(binary(Alias::new("public_key")))
                    .col(big_integer(Alias::new("sequence")))
                    .col(integer_null(Alias::new("content_digest_type")))
                    .col(binary_null(Alias::new("content_digest_bytes")))
                    .col(binary(Alias::new("signature")))
                    .col(binary(Alias::new("previous_signature")))
                    .col(binary(Alias::new("previous_root")))
                    .col(binary(Alias::new("event_bytes")))
                    .col(timestamp(Alias::new("created_at")))
                    .col(timestamp(Alias::new("synced_at")))
                    .to_owned(),
            )
            .await?;
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx-events-event_key")
                    .table(Alias::new("events"))
                    .col(Alias::new("collection"))
                    .col(Alias::new("identity"))
                    .col(Alias::new("public_key_type"))
                    .col(Alias::new("public_key"))
                    .col(Alias::new("sequence"))
                    .unique()
                    .to_owned(),
            )
            .await?;

        // content_post
        let mut content_post = Table::create();
        content_post
            .table(Alias::new("content_post"))
            .if_not_exists()
            .col(big_integer(Alias::new("content_id")).primary_key())
            .col(string(Alias::new("text")));
        // The reply/quote event-key columns are all nullable.
        for prefix in ["reply_root_", "reply_parent_", "quote_"] {
            content_post
                .col(small_integer_null(Alias::new(format!(
                    "{prefix}collection"
                ))))
                .col(string_null(Alias::new(format!("{prefix}identity"))))
                .col(small_integer_null(Alias::new(format!(
                    "{prefix}public_key_type"
                ))))
                .col(binary_null(Alias::new(format!("{prefix}public_key"))))
                .col(big_integer_null(Alias::new(format!("{prefix}sequence"))));
        }
        manager.create_table(content_post.to_owned()).await?;

        // content_delete
        let mut content_delete = Table::create();
        content_delete
            .table(Alias::new("content_delete"))
            .if_not_exists()
            .col(big_integer(Alias::new("content_id")).primary_key());
        event_key_columns(&mut content_delete, "event_key_");
        manager.create_table(content_delete.to_owned()).await?;

        // content_follow
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("content_follow"))
                    .if_not_exists()
                    .col(big_integer(Alias::new("content_id")).primary_key())
                    .col(string(Alias::new("identity_id")))
                    .to_owned(),
            )
            .await?;

        // content_block
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("content_block"))
                    .if_not_exists()
                    .col(big_integer(Alias::new("content_id")).primary_key())
                    .col(string(Alias::new("identity_id")))
                    .to_owned(),
            )
            .await?;

        // content_reaction
        let mut content_reaction = Table::create();
        content_reaction
            .table(Alias::new("content_reaction"))
            .if_not_exists()
            .col(big_integer(Alias::new("content_id")).primary_key());
        event_key_columns(&mut content_reaction, "event_key_");
        content_reaction
            .col(string_null(Alias::new("emoji")))
            .col(boolean(Alias::new("positive")));
        manager.create_table(content_reaction.to_owned()).await?;

        // content_profile_update
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("content_profile_update"))
                    .if_not_exists()
                    .col(big_integer(Alias::new("content_id")).primary_key())
                    .col(string_null(Alias::new("name")))
                    .col(small_integer_null(Alias::new("avatar_digest_type")))
                    .col(binary_null(Alias::new("avatar_digest_bytes")))
                    .col(small_integer_null(Alias::new("banner_digest_type")))
                    .col(binary_null(Alias::new("banner_digest_bytes")))
                    .to_owned(),
            )
            .await?;

        // content_image
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("content_image"))
                    .if_not_exists()
                    .col(big_integer(Alias::new("content_id")).primary_key())
                    .col(small_integer(Alias::new("blob_digest_type")))
                    .col(binary(Alias::new("blob_digest_bytes")))
                    .col(integer(Alias::new("width")))
                    .col(integer(Alias::new("height")))
                    .to_owned(),
            )
            .await?;

        // content_blob
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("content_blob"))
                    .if_not_exists()
                    .col(big_integer(Alias::new("content_id")).primary_key())
                    .col(small_integer(Alias::new("digest_type")))
                    .col(binary(Alias::new("digest_bytes")))
                    .col(string(Alias::new("mime_type")))
                    .col(big_integer(Alias::new("size")))
                    .to_owned(),
            )
            .await?;
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx-content_blob-digest")
                    .table(Alias::new("content_blob"))
                    .col(Alias::new("digest_type"))
                    .col(Alias::new("digest_bytes"))
                    .unique()
                    .to_owned(),
            )
            .await?;

        // content_identity
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("content_identity"))
                    .if_not_exists()
                    .col(big_integer(Alias::new("content_id")).primary_key())
                    .col(string(Alias::new("identity")))
                    .col(binary(Alias::new("identity_bytes")))
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for table in [
            "content_identity",
            "content_blob",
            "content_image",
            "content_profile_update",
            "content_reaction",
            "content_block",
            "content_follow",
            "content_delete",
            "content_post",
            "events",
            "content",
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
