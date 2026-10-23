use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const NEW: &str = "CREATE FUNCTION decay_interaction_count(total_count BIGINT, created_at TIMESTAMPTZ) RETURNS NUMERIC
  IMMUTABLE PARALLEL SAFE
  LANGUAGE plpgsql
AS $$
BEGIN
  RETURN CASE
    WHEN created_at < (SELECT expires_at FROM gravity) THEN 0
    ELSE (
      (total_count + 1)::NUMERIC / power(
        GREATEST(
          EXTRACT(epoch FROM ((SELECT calculated_at FROM gravity) - created_at))::NUMERIC / 3600::NUMERIC,
          0::NUMERIC
        ) + 2::NUMERIC,
        (SELECT value FROM gravity)
      )
    )::NUMERIC(20, 11)
  END;
EXCEPTION
    WHEN numeric_value_out_of_range THEN
      RETURN (0)::numeric;
END;
$$";

const OLD: &str = "CREATE FUNCTION reaction_count_decay(reaction_count BIGINT, post_created_at TIMESTAMPTZ) RETURNS NUMERIC
  IMMUTABLE PARALLEL SAFE
  LANGUAGE plpgsql
AS $$
BEGIN
  RETURN CASE
    WHEN post_created_at < (SELECT expires_at FROM gravity) THEN 0
    ELSE (
      (reaction_count + 1)::NUMERIC / power(
        GREATEST(
          EXTRACT(epoch FROM ((SELECT calculated_at FROM gravity) - post_created_at))::NUMERIC / 3600::NUMERIC,
          0::NUMERIC
        ) + 2::NUMERIC,
        (SELECT value FROM gravity)
      )
    )::NUMERIC(20, 11)
  END;
EXCEPTION
    WHEN numeric_value_out_of_range THEN
      RETURN (0)::numeric;
END;
$$";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared("DROP FUNCTION reaction_count_decay;")
            .await?;
        tx.execute_unprepared(NEW).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared("DROP FUNCTION decay_interaction_count;")
            .await?;
        tx.execute_unprepared(OLD).await?;
        Ok(())
    }
}
