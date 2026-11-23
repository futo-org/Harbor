use polycentric_common::models::protos_v2::content::ContentBody;
use polycentric_common::models::protos_v2::{
    Blob, Content, ContentDigest, Image, ImageSet,
};
use prost::Message;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    // Don't want to write everything in one transaction, doing it in batches
    // should be easier on the database.
    fn use_transaction(&self) -> Option<bool> {
        Some(false)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared("CREATE UNIQUE INDEX IF NOT EXISTS content_image_temp_unique ON content_image (content_id, digest_type, digest_bytes)").await?;

        let mut content_id: i64 = 0;
        loop {
            let mut query = SelectStatement::new();
            query
                .expr(Expr::col("id"))
                .expr(Expr::col("serialized_bytes"))
                .from("content")
                .and_where(Expr::col("id").gt(content_id))
                .limit(1000);

            let contents = tx.query_all(&query).await?;

            match contents.last() {
                Some(row) => content_id = row.try_get_by(0)?,
                None => break,
            }

            let mut content_ids = Vec::new();
            let mut digest_types = Vec::new();
            let mut digest_bytes = Vec::new();
            let mut sizes = Vec::new();
            let mut mime_types = Vec::new();
            let mut widths = Vec::new();
            let mut heights = Vec::new();
            for row in contents {
                let content_id: i64 = row.try_get_by(0)?;
                let serialized_bytes: Vec<u8> = row.try_get_by(1)?;

                if let Ok(Content {
                    content_body: Some(body),
                    ..
                }) = Content::decode(&*serialized_bytes)
                {
                    let images = match body {
                        ContentBody::Post(post) => post.images,
                        ContentBody::ProfileUpdate(update) => {
                            match (update.avatar, update.banner) {
                                (Some(a), Some(b)) => vec![a, b],
                                (Some(a), None) => vec![a],
                                (None, Some(b)) => vec![b],
                                (None, None) => continue,
                            }
                        }
                        ContentBody::VerificationClaim(claim) => claim.images,
                        _ => continue,
                    };

                    for set in images {
                        let ImageSet { images } = set;
                        for image in images {
                            #[rustfmt::skip]
                            let Image { blob, width, height } = image;
                            #[rustfmt::skip]
                            let Some(Blob { digest, mime_type, size }) = blob else { continue; };
                            #[rustfmt::skip]
                            let Some(ContentDigest { r#type, value }) = digest else { continue; };
                            content_ids.push(content_id);
                            digest_types.push(r#type);
                            digest_bytes.push(value);
                            sizes.push(size);
                            mime_types.push(mime_type);
                            widths.push(width);
                            heights.push(height);
                        }
                    }
                }
            }

            let mut query = InsertStatement::new();
            query
                .into_table("content_image")
                .columns([
                    "content_id",
                    "digest_type",
                    "digest_bytes",
                    "size",
                    "mime_type",
                    "width",
                    "height",
                ])
                .values_panic([
                    Expr::cust_with_expr("UNNEST($1)", content_ids),
                    Expr::cust_with_expr("UNNEST($1)", digest_types),
                    Expr::cust_with_expr("UNNEST($1)", digest_bytes),
                    Expr::cust_with_expr("UNNEST($1)", sizes),
                    Expr::cust_with_expr("UNNEST($1)", mime_types),
                    Expr::cust_with_expr("UNNEST($1)", widths),
                    Expr::cust_with_expr("UNNEST($1)", heights),
                ])
                .on_conflict({
                    let mut c = OnConflict::new();
                    c.do_nothing();
                    c
                });

            tx.execute(&query).await?;
        }

        tx.execute_unprepared("DROP INDEX IF EXISTS content_image_temp_unique")
            .await?;

        Ok(())
    }

    async fn down(&self, _: &SchemaManager) -> Result<(), DbErr> {
        // Not undoing a data migration.
        Ok(())
    }
}
