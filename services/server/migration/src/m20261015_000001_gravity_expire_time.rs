use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const NEW: &str = "CREATE FUNCTION reaction_count_decay(reaction_count BIGINT, post_created_at TIMESTAMPTZ) RETURNS NUMERIC
  IMMUTABLE PARALLEL SAFE
  LANGUAGE plpgsql
AS $$
BEGIN
  RETURN (
    (reaction_count + 1)::NUMERIC / power(
      GREATEST(
        EXTRACT(epoch FROM ((SELECT calculated_at FROM gravity) - post_created_at))::NUMERIC / 3600::NUMERIC,
        0::NUMERIC
      ) + 2::NUMERIC,
      (SELECT value FROM gravity)
    )
  )::NUMERIC(20, 11);
EXCEPTION
    WHEN numeric_value_out_of_range THEN
      RETURN (0)::numeric;
END;
$$";

const OLD_FOUR_ARG: &str = "CREATE OR REPLACE FUNCTION reaction_count_decay(reaction_count BIGINT, post_created_at TIMESTAMPTZ, gravity NUMERIC, gravity_time TIMESTAMPTZ) RETURNS NUMERIC
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

const OLD_THREE_ARG: &str = "
CREATE OR REPLACE FUNCTION reaction_count_decay(reaction_count bigint, post_created_at timestamp with time zone) RETURNS NUMERIC
    LANGUAGE sql STABLE PARALLEL SAFE
    RETURN reaction_count_decay(reaction_count, post_created_at, (SELECT value FROM gravity), (SELECT calculated_at FROM gravity));";

const OLD_TWO_ARG: &str = "
CREATE OR REPLACE FUNCTION reaction_count_decay(reaction_count bigint, post_created_at timestamp with time zone, gravity numeric) RETURNS NUMERIC
    LANGUAGE sql STABLE PARALLEL SAFE
    RETURN reaction_count_decay(reaction_count, post_created_at, gravity, (SELECT calculated_at FROM gravity));";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared("DROP FUNCTION reaction_count_decay(bigint, timestamp with time zone);").await?;
        tx.execute_unprepared("DROP FUNCTION reaction_count_decay(bigint, timestamp with time zone, numeric);").await?;
        tx.execute_unprepared("DROP FUNCTION reaction_count_decay(bigint, timestamp with time zone, numeric, timestamp with time zone);").await?;
        tx.execute_unprepared(NEW).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared(OLD_FOUR_ARG).await?;
        tx.execute_unprepared(OLD_THREE_ARG).await?;
        tx.execute_unprepared(OLD_TWO_ARG).await?;
        Ok(())
    }
}
