use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const NEW: &str = "CREATE OR REPLACE FUNCTION reaction_count_decay(reaction_count BIGINT, post_created_at TIMESTAMPTZ, gravity NUMERIC, gravity_time TIMESTAMPTZ) RETURNS NUMERIC
  IMMUTABLE PARALLEL SAFE
  LANGUAGE plpgsql
AS $$
BEGIN
  RETURN (
    (reaction_count + 1)::NUMERIC / power(
      GREATEST(
        EXTRACT(epoch FROM (gravity_time - post_created_at))::NUMERIC / 3600::NUMERIC,
        0::NUMERIC
      ) + 2::NUMERIC,
      gravity
    )
  )::NUMERIC(20, 11);
EXCEPTION
    WHEN numeric_value_out_of_range THEN
      RETURN (0)::numeric;
END;
$$";

const OLD: &str = "CREATE OR REPLACE FUNCTION reaction_count_decay(reaction_count BIGINT, post_created_at TIMESTAMPTZ, gravity NUMERIC, gravity_time TIMESTAMPTZ) RETURNS NUMERIC
      LANGUAGE sql IMMUTABLE PARALLEL SAFE
    RETURN (
      (reaction_count + 1)::NUMERIC / power(
        GREATEST(
          EXTRACT(epoch FROM (gravity_time - post_created_at))::NUMERIC / 3600::NUMERIC,
          0::NUMERIC
        ) + 2::NUMERIC,
        gravity
      )
    )::NUMERIC(20, 11);";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager.get_connection().execute_unprepared(NEW).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager.get_connection().execute_unprepared(OLD).await?;
        Ok(())
    }
}
