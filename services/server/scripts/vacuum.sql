-- Must be run in one sessions, but not needed to run in a single transaction.

-- Gather more statics than the default of 100, makes a lot of our queries run
-- faster in production.
SET default_statistics_target = 1000;

-- Cleanup our tables & analyze some values to update the statistics used in
-- query planning.
VACUUM (ANALYZE, BUFFER_USAGE_LIMIT '1GB');
