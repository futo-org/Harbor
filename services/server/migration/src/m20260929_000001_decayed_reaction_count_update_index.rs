use entity::reaction_tally;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// This index is specifically for the updating of decayed reaction tally
/// counts.
const NAME: &str = "reaction_tally_decayed_count_update";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(&format!("CREATE INDEX {NAME} ON reaction_tally USING btree (event_id DESC) WHERE (decayed_count > 0::numeric)"))
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index({
                let mut i = Index::drop();
                i.if_exists().name(NAME).table(reaction_tally::Entity);
                i
            })
            .await
    }
}
