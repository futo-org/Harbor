use sea_orm::{entity::prelude::*, sea_query::value::prelude::serde_json};

#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "status")]
pub enum Status {
    #[sea_orm(string_value = "PENDING")]
    Pending,
    #[sea_orm(string_value = "SUCCESS")]
    Success,
    #[sea_orm(string_value = "FAILED")]
    Failed,
}

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "processed_content")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub digest_type: i32,

    #[sea_orm(primary_key)]
    pub digest_bytes: Vec<u8>,

    pub created_at: TimeDateTime,
    pub updated_at: TimeDateTime,

    pub status: Status,

    // Populated once Azure has processed the content; null while pending
    // or on failure.
    pub is_csam: Option<bool>,

    pub azure_response: Option<serde_json::Value>,
}

impl ActiveModelBehavior for ActiveModel {}
