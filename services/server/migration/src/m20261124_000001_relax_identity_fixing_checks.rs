use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const NEW_PARSE: &str = "
CREATE OR REPLACE FUNCTION parse_for_search(text TEXT) RETURNS SETOF TEXT
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
BEGIN ATOMIC;
  WITH
  tokens_word AS (
    SELECT tokid AS id FROM ts_token_type('default') WHERE alias IN ('asciiword', 'word', 'numword', 'hword_numpart', 'hword_part', 'hword_asciipart', 'numhword', 'asciihword', 'hword')
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
        WHEN parsed.tokid = (SELECT id FROM token_sfloat) AND LEAD(parsed.tokid, 1, NULL) OVER () IN (SELECT id FROM tokens_word) THEN
          parsed.token || LEAD(parsed.token, 1, '') OVER ()
        WHEN parsed.tokid IN (SELECT id FROM tokens_word) AND LAG(parsed.tokid, 1, NULL) OVER () = (SELECT id FROM token_sfloat) THEN
          NULL -- Included in previous row.

        -- Merge hashtags with the next token.
        WHEN parsed.tokid = (SELECT id FROM token_blank) AND right(parsed.token, 1) = '#' THEN
          '#' || LEAD(parsed.token, 1, '') OVER ()
        WHEN LAG(parsed.tokid, 1, NULL) OVER () = (SELECT id FROM token_blank) AND LAG(right(parsed.token, 1), 1, NULL) OVER () = '#' THEN
          NULL -- Included in previous row.

        -- Merge partial aliases.
        -- Full aliases such as \"mark@futo.tech\" are parsed as a single (email)
        -- token. However, \"mark@futo\" is parsed as \"mark\", \"@\" and \"futo\", which
        -- won't match the full alias. To fix this merge the three tokens in the
        -- second token, i.e. \"@\" becomes \"mark@futo\" (in addition to keeping the
        -- \"mark\" and \"futo\" token).
        WHEN parsed.token = '@' AND LAG(parsed.token, 1, NULL) OVER () IS NOT NULL AND LEAD(parsed.token, 1, NULL) OVER () IS NOT NULL THEN
          LAG(parsed.token, 1, '') OVER () || '@' || LEAD(parsed.token, 1, '') OVER ()

        -- Remove unprocessed whitespace.
        WHEN parsed.tokid = (SELECT id FROM token_blank) THEN
          NULL

        ELSE
          parsed.token
      END AS token
    FROM ts_parse('default', parse_for_search.text) AS parsed
  ),
  transformed AS (
    SELECT
      -- Transform the token some more, in order: include name & domain as
      -- separate tokens for aliases/emails, trim whitespace, unnaccent, stem
      -- (using the English dictionary).
      UNNEST(
        ts_lexize(
          'english_stem',
          unaccent(
            trim(E'\t\n\r ' FROM (
              UNNEST(
                CASE
                  -- Aliases and emails addresses, e.g. \"mark@futo.tech\" are
                  -- parsed as a single token. This means that we won't match on
                  -- the domain only, e.g. \"futo.tech\".
                  -- To support this split token on \"@\", resulting in the name and
                  -- domain of the alias. Add the token itself to include the
                  -- entire alias/email.
                  WHEN parsed.token LIKE '%@%' THEN
                    array_append(string_to_array(parsed.token, '@'), parsed.token)
                  ELSE
                    ARRAY[parsed.token]
                END
              )
            ))
          )
        )
      ) as term
    FROM parsed
    -- Filter out empty and NULL tokens.
    WHERE parsed.token != ''
      AND parsed.token IS NOT NULL
  )
  -- After stemming remove the starting hashtag so that searching \"hashtag\"
  -- matches \"#hashtag\".
  -- Remove empty strings and NULL strings to avoid issues with
  -- array_to_tsvector.
  SELECT transformed.term
  FROM (
    SELECT ltrim(transformed.term, '#') AS term
    FROM transformed
  ) AS transformed(term)
  WHERE transformed.term IS NOT NULL
    AND transformed.term != '';
END;
";

const OLD_PARSE: &str = "
CREATE OR REPLACE FUNCTION parse_for_search(text TEXT) RETURNS SETOF TEXT
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
BEGIN ATOMIC;
  WITH
  token_numword AS (
    SELECT tokid AS id FROM ts_token_type('default') WHERE alias = 'numword' LIMIT 1
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
          NULL -- Included in previous row.

        -- Merge hashtags with the next token.
        WHEN parsed.tokid = (SELECT id FROM token_blank) AND right(parsed.token, 1) = '#' THEN
          '#' || LEAD(parsed.token, 1, '') OVER ()
        WHEN LAG(parsed.tokid, 1, NULL) OVER () = (SELECT id FROM token_blank) AND LAG(right(parsed.token, 1), 1, NULL) OVER () = '#' THEN
          NULL -- Included in previous row.

        -- Merge partial aliases.
        -- Full aliases such as \"mark@futo.tech\" are parsed as a single (email)
        -- token. However, \"mark@futo\" is parsed as \"mark\", \"@\" and \"futo\", which
        -- won't match the full alias. To fix this merge the three tokens in the
        -- second token, i.e. \"@\" becomes \"mark@futo\" (in addition to keeping the
        -- \"mark\" and \"futo\" token).
        WHEN parsed.token = '@' AND LAG(parsed.token, 1, NULL) OVER () IS NOT NULL AND LEAD(parsed.token, 1, NULL) OVER () IS NOT NULL THEN
          LAG(parsed.token, 1, '') OVER () || '@' || LEAD(parsed.token, 1, '') OVER ()

        -- Remove unprocessed whitespace.
        WHEN parsed.tokid = (SELECT id FROM token_blank) THEN
          NULL

        ELSE
          parsed.token
      END AS token
    FROM ts_parse('default', parse_for_search.text) AS parsed
  ),
  transformed AS (
    SELECT
      -- Transform the token some more, in order: include name & domain as
      -- separate tokens for aliases/emails, trim whitespace, unnaccent, stem
      -- (using the English dictionary).
      UNNEST(
        ts_lexize(
          'english_stem',
          unaccent(
            trim(E'\t\n\r ' FROM (
              UNNEST(
                CASE
                  -- Aliases and emails addresses, e.g. \"mark@futo.tech\" are
                  -- parsed as a single token. This means that we won't match on
                  -- the domain only, e.g. \"futo.tech\".
                  -- To support this split token on \"@\", resulting in the name and
                  -- domain of the alias. Add the token itself to include the
                  -- entire alias/email.
                  WHEN parsed.token LIKE '%@%' THEN
                    array_append(string_to_array(parsed.token, '@'), parsed.token)
                  ELSE
                    ARRAY[parsed.token]
                END
              )
            ))
          )
        )
      ) as term
    FROM parsed
    -- Filter out empty and NULL tokens.
    WHERE parsed.token != ''
      AND parsed.token IS NOT NULL
  )
  -- After stemming remove the starting hashtag so that searching \"hashtag\"
  -- matches \"#hashtag\".
  -- Remove empty strings and NULL strings to avoid issues with
  -- array_to_tsvector.
  SELECT transformed.term
  FROM (
    SELECT ltrim(transformed.term, '#') AS term
    FROM transformed
  ) AS transformed(term)
  WHERE transformed.term IS NOT NULL
    AND transformed.term != '';
END;
";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(NEW_PARSE).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(OLD_PARSE).await?;

        Ok(())
    }
}
