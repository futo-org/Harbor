use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Native Postgres enum backing `processed_content.status`.
        manager
            .create_type(
                extension::postgres::Type::create()
                    .as_enum(Status::Enum)
                    .values([Status::Pending, Status::Success, Status::Failed])
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(ProcessedContent::Table)
                    .if_not_exists()
                    .col(integer(ProcessedContent::DigestType))
                    .col(binary(ProcessedContent::DigestBytes))
                    .col(timestamp(ProcessedContent::CreatedAt))
                    .col(timestamp(ProcessedContent::UpdatedAt))
                    .col(enumeration(
                        ProcessedContent::Status,
                        Status::Enum,
                        [Status::Pending, Status::Success, Status::Failed],
                    ))
                    .col(boolean_null(ProcessedContent::IsCsam))
                    .col(json_null(ProcessedContent::AzureResponse))
                    .primary_key(
                        Index::create()
                            .col(ProcessedContent::DigestType)
                            .col(ProcessedContent::DigestBytes),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ProcessedContent::Table).to_owned())
            .await?;

        manager
            .drop_type(
                extension::postgres::Type::drop()
                    .name(Status::Enum)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum ProcessedContent {
    Table,
    DigestType,
    DigestBytes,
    CreatedAt,
    UpdatedAt,
    Status,
    IsCsam,
    AzureResponse,
}

#[derive(DeriveIden)]
enum Status {
    // The enum type name itself.
    #[sea_orm(iden = "status")]
    Enum,
    #[sea_orm(iden = "PENDING")]
    Pending,
    #[sea_orm(iden = "SUCCESS")]
    Success,
    #[sea_orm(iden = "FAILED")]
    Failed,
}
