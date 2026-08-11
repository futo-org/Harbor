use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::ConnectionTrait;

const RETIRED_CATEGORY_ABUSE: i16 = 2;
const RETIRED_CATEGORY_TERRORISM: i16 = 4;
const RETIRED_CATEGORY_ILLEGAL: i16 = 5;
const CATEGORY_SERVER_POLICY: i16 = 7;
const CATEGORY_VIOLENCE: i16 = 8;

const REMAPPINGS: &[(i16, i16)] = &[
    (RETIRED_CATEGORY_ABUSE, CATEGORY_VIOLENCE),
    (RETIRED_CATEGORY_TERRORISM, CATEGORY_VIOLENCE),
    (RETIRED_CATEGORY_ILLEGAL, CATEGORY_SERVER_POLICY),
];

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_table("content_report").await? {
            return Ok(());
        }

        for (retired, replacement) in REMAPPINGS {
            manager
                .get_connection()
                .execute_unprepared(&format!(
                    "UPDATE content_report SET category = {replacement} \
                     WHERE category = {retired}"
                ))
                .await?;
        }

        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
