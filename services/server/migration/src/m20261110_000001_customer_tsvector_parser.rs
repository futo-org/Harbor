use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const CREATE_PARSE_FOR_SEARCH: &str = "
CREATE OR REPLACE FUNCTION parse_for_search(text TEXT) RETURNS TEXT[]
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN (
  WITH
  token_numword AS (
    SELECT tokid AS id FROM ts_token_type('default') WHERE alias = 'numword' LIMIT 1
  ),
  token_word AS (
    SELECT tokid AS id FROM ts_token_type('default') WHERE alias = 'word' LIMIT 1
  ),
  token_sfloat AS (
    SELECT tokid AS id FROM ts_token_type('default') WHERE alias = 'sfloat' LIMIT 1
  ),
  token_blank AS (
    SELECT tokid AS id FROM ts_token_type('default') WHERE alias = 'blank' LIMIT 1
  ),
  parsed AS (
    SELECT
      -- In some cases the default parser used by Postgres doesn't do the thing
      -- we want, for example is splits identities in to a scientific number and
      -- the remainder of a word. Although this seems like a bug to me, I asked
      -- about it on the mailing list and it was reported as working as
      -- intended.
      --
      -- The next logical step would be to write your own parser, except that
      -- has to be done in a native function (i.e. C, not SQL) and requires
      -- superuser access, which is not ideal.
      --
      -- So we implement this work around that changes the default (and only)
      -- parser to work in the way we want it to.
      --
      -- This works as of Postgres 18.
      CASE
        -- Merge split identities, parsed as \"sfloat\" (Scientific notation)
        -- followed by \"numword\" (Word, letters and digits).
        WHEN parsed.tokid = (SELECT id FROM token_sfloat) AND LEAD(parsed.tokid, 1, NULL) OVER () = (SELECT id FROM token_numword) THEN
          parsed.token || LEAD(parsed.token, 1, '') OVER ()
        WHEN parsed.tokid = (SELECT id FROM token_numword) AND LAG(parsed.tokid, 1, NULL) OVER () = (SELECT id FROM token_sfloat) THEN
          '' -- Included in previous row.

        -- Merge hashtags with the next token.
        WHEN parsed.tokid = (SELECT id FROM token_blank) AND right(parsed.token, 1) = '#' THEN
          '#' || LEAD(parsed.token, 1, '') OVER ()
        WHEN LAG(parsed.tokid, 1, NULL) OVER () = (SELECT id FROM token_blank) AND LAG(right(parsed.token, 1), 1, NULL) OVER () = '#' THEN
          '' -- Included in previous row.

        -- Merge partial aliases.
        -- Full aliases such as \"mark@futo.tech\" are parsed as a single (email)
        -- token. However, \"mark@futo\" is parsed as \"mark\", \"@\" and \"futo\", which
        -- won't match the full alias. To fix this merge the three tokens in the
        -- second token, i.e. \"@\" becomes \"mark@futo\" (in addition to keeping the
        -- \"mark\" and \"futo\" token).
        WHEN parsed.token = '@' THEN
          LAG(parsed.token, 1, '') OVER () || '@' || LEAD(parsed.token, 1, '') OVER ()

        ELSE
          parsed.token
      END AS token,
      parsed.tokid
    FROM ts_parse('default', parse_for_search.text) AS parsed
  ),
  transformed AS (
    SELECT
      -- Transform the token some more, in order: trim whitespace, unnaccent, stem
      -- (using the English dictionary).
      UNNEST(
        ts_lexize(
          'english_stem',
          unaccent(
            trim(E'\t\n\r ' FROM parsed.token)
          )
        )
      ) as term
    FROM parsed
    WHERE octet_length(parsed.token) != 0 -- Filter out the token merged with another.
      -- Remove whitespace, but not hashtags or merged aliases.
      AND NOT (
        parsed.tokid = (SELECT id FROM token_blank)
          AND left(parsed.token, 1) != '#'
          AND parsed.token NOT LIKE '%@%'
      )
  )
  -- After stemming remove the starting hashtag so that searching \"hashtag\"
  -- matches \"#hashtag\".
  -- Turn empty strings into NULL (which are removed by array_agg) to avoid
  -- issues with array_to_tsvector.
  SELECT array_agg(transformed.term)
  FROM (
    SELECT ltrim(transformed.term, '#')
    FROM transformed
  ) AS transformed(term)
  WHERE transformed.term IS NOT NULL
    AND transformed.term != ''
);
";

const CREATE_TSVECTOR: &str = "
CREATE OR REPLACE FUNCTION create_tsvector(text TEXT) RETURNS TSVECTOR
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN (
  SELECT COALESCE(array_to_tsvector(parse_for_search(create_tsvector.text)), ''::TSVECTOR) AS vector
)
";

const CREATE_TS_SEARCH: &str = "
CREATE OR REPLACE FUNCTION create_tsquery(query TEXT) RETURNS TSQUERY
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN (
  WITH
  transformed AS (
    SELECT
      CASE
        -- Aliases are parsed as email addresses and are matched quite
        -- strictly. For example \"mark@futo\" will not match \"mark@futo.tech\".
        -- For such partial aliases/emails we get three tokens, for example
        -- \"mark@futo\" becomes \"mark\", \"mark@futo\" and \"futo\". We don't want to
        -- match all three tokens (as we're using '&' to join the terms). What
        -- we want is to match any of the three, thus we want
        -- \"(mark | mark@futo:* | futo)\", that is what we do below.
        WHEN terms.term LIKE '%@%'
          AND LAG(terms.term, 1, NULL) OVER () IS NOT NULL
          AND LEAD(terms.term, 1, NULL) OVER () IS NOT NULL
        THEN
          '( ' ||
            LAG(terms.term, 1, NULL) OVER () ||
            ' | ' ||
            terms.term || ':*' || -- Prefix match.
            ' | ' ||
            LEAD(terms.term, 1, NULL) OVER () ||
          ' )'
        -- These are the first (\"mark\") and third (\"futo\") tokens in the example
        -- above) and already include above, don't want to include them again.
        WHEN LEAD(terms.term, 1, NULL) OVER () LIKE '%@%'
          OR LAG(terms.term, 1, NULL) OVER () LIKE '%@%'
        THEN
          NULL

        -- Enable prefix matching on the last term to support autocomplete.
        WHEN LEAD(terms.term, 1, NULL) OVER () IS NULL THEN
          terms.term || ':*'

        ELSE
          terms.term
      END AS term
    FROM UNNEST(parse_for_search(create_tsquery.query)) AS terms(term)
  )
  SELECT COALESCE(string_agg(transformed.term, ' & ')::TSQUERY, ''::TSQUERY) AS query
  FROM transformed
)
";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared("CREATE EXTENSION IF NOT EXISTS unaccent")
            .await?;
        tx.execute_unprepared(CREATE_PARSE_FOR_SEARCH).await?;
        tx.execute_unprepared(CREATE_TSVECTOR).await?;
        tx.execute_unprepared(CREATE_TS_SEARCH).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared("DROP FUNCTION IF EXISTS create_tsquery(TEXT)")
            .await?;
        tx.execute_unprepared("DROP FUNCTION IF EXISTS create_tsvector(TEXT)")
            .await?;
        tx.execute_unprepared("DROP FUNCTION IF EXISTS parse_for_search(TEXT)")
            .await?;
        tx.execute_unprepared("DROP EXTENSION IF EXISTS unaccent")
            .await?;
        Ok(())
    }
}
