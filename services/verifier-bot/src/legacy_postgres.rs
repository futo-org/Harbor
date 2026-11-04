//! Import the bot's login and events from the Postgres tables the old
//! `@polycentric/js-storage-postgres` driver wrote, so a deployment that kept
//! its state there (and has no local volume) keeps its identity. Everything
//! already stored locally is skipped; events written since are pulled back
//! from the servers by the next sync.

use std::str::FromStr;

use polycentric_common::models::protos_v2::{ContentDigest, PublicKey, SignedEvent};
use polycentric_core::sdk::Client;
use polycentric_core::sdk::keys::KeyPair;
use polycentric_core::sdk::logins::ImportedLogin;
use polycentric_core::sdk::storage::{LoginId, LoginStatus};
use prost::Message;
use sqlx::postgres::{PgConnectOptions, PgConnection};
use sqlx::{Connection, Row};

/// Split `?schema=<name>` off a postgres:// URL, validating the name.
pub fn split_schema(url: &str) -> Result<(String, Option<String>), String> {
    let mut parsed = url::Url::parse(url).map_err(|e| format!("invalid database URL: {e}"))?;
    let mut schema = None;
    let rest: Vec<(String, String)> = parsed
        .query_pairs()
        .into_owned()
        .filter(|(k, v)| {
            if k == "schema" {
                schema.get_or_insert_with(|| v.clone());
                false
            } else {
                true
            }
        })
        .collect();
    if rest.is_empty() {
        parsed.set_query(None);
    } else {
        parsed.query_pairs_mut().clear().extend_pairs(rest);
    }
    if let Some(schema) = &schema {
        let valid = schema
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
            && schema
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_');
        if !valid {
            return Err(format!("Invalid postgres schema name: '{schema}'"));
        }
    }
    Ok((parsed.to_string(), schema))
}

async fn table_exists(db: &mut PgConnection, table: &str) -> Result<bool, sqlx::Error> {
    let row = sqlx::query("SELECT to_regclass($1)::text AS t")
        .bind(table)
        .fetch_one(db)
        .await?;
    Ok(row.try_get::<Option<String>, _>("t")?.is_some())
}

/// Import from the database at `url` (`?schema=<name>` picks the schema).
pub async fn import(client: &Client, url: &str) -> Result<(), String> {
    let (url, schema) = split_schema(url)?;
    let mut options = PgConnectOptions::from_str(&url).map_err(|e| e.to_string())?;
    if let Some(schema) = &schema {
        options = options.options([("search_path", schema.as_str())]);
    }
    let mut db = PgConnection::connect_with(&options)
        .await
        .map_err(|e| format!("failed to connect: {e}"))?;
    let result = read_and_import(client, &mut db).await;
    if let Err(e) = db.close().await {
        tracing::warn!("failed to close the legacy database connection: {e}");
    }
    result
}

async fn read_and_import(client: &Client, db: &mut PgConnection) -> Result<(), String> {
    let e = |e: sqlx::Error| e.to_string();
    if !table_exists(db, "logins").await.map_err(e)? {
        return Ok(());
    }

    let mut logins = Vec::new();
    for row in sqlx::query(
        "SELECT identity, key_type, public_key, status, private_key FROM logins
         WHERE private_key_location = 'inline' AND status <> 'pendingDeletion'",
    )
    .fetch_all(&mut *db)
    .await
    .map_err(e)?
    {
        let identity: String = row.try_get("identity").map_err(e)?;
        let key_type: i32 = row.try_get("key_type").map_err(e)?;
        let status: String = row.try_get("status").map_err(e)?;
        let Some(private_key) = row
            .try_get::<Option<Vec<u8>>, _>("private_key")
            .map_err(e)?
        else {
            continue;
        };
        let login = KeyPair::from_private_key(key_type, &private_key)
            .and_then(|key_pair| Ok((key_pair, LoginStatus::parse(&status)?)));
        match login {
            Ok((key_pair, status)) => logins.push(ImportedLogin {
                identity,
                key_pair,
                status,
            }),
            Err(err) => tracing::warn!("skipping legacy login for {identity}: {err}"),
        }
    }

    let active =
        sqlx::query("SELECT identity, key_type, public_key FROM active_login WHERE id = 1")
            .fetch_optional(&mut *db)
            .await
            .map_err(e)?
            .map(|row| -> Result<LoginId, sqlx::Error> {
                Ok(LoginId {
                    identity: row.try_get("identity")?,
                    public_key: PublicKey {
                        key_type: row.try_get("key_type")?,
                        key: row.try_get("public_key")?,
                    },
                })
            })
            .transpose()
            .map_err(e)?;

    let events = if table_exists(db, "events").await.map_err(e)? {
        sqlx::query("SELECT signature, event_bytes FROM events")
            .fetch_all(&mut *db)
            .await
            .map_err(e)?
            .into_iter()
            .map(|row| {
                Ok(SignedEvent {
                    signature: row.try_get("signature")?,
                    event_bytes: row.try_get("event_bytes")?,
                })
            })
            .collect::<Result<Vec<_>, sqlx::Error>>()
            .map_err(e)?
    } else {
        Vec::new()
    };

    let contents = if table_exists(db, "content").await.map_err(e)? {
        let mut contents = Vec::new();
        for row in sqlx::query("SELECT digest_bytes, content_bytes FROM content")
            .fetch_all(&mut *db)
            .await
            .map_err(e)?
        {
            // `digest_bytes` is a serialized ContentDigest.
            let digest: Vec<u8> = row.try_get("digest_bytes").map_err(e)?;
            let content: Vec<u8> = row.try_get("content_bytes").map_err(e)?;
            match ContentDigest::decode(digest.as_slice()) {
                Ok(digest) => contents.push((digest, content)),
                Err(err) => tracing::warn!("skipping legacy content with a bad digest: {err}"),
            }
        }
        contents
    } else {
        Vec::new()
    };

    tracing::info!(
        "Importing {} login(s), {} event(s) and {} content(s) from the legacy Postgres database",
        logins.len(),
        events.len(),
        contents.len()
    );
    client
        .import(events, contents, logins, active)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_the_schema_off() {
        let (url, schema) =
            split_schema("postgres://u:p@db:5432/polycentric?schema=verifier_bot").unwrap();
        assert_eq!(url, "postgres://u:p@db:5432/polycentric");
        assert_eq!(schema.as_deref(), Some("verifier_bot"));

        let (url, schema) =
            split_schema("postgres://u:p@db:5432?sslmode=require&schema=bot").unwrap();
        assert_eq!(url, "postgres://u:p@db:5432?sslmode=require");
        assert_eq!(schema.as_deref(), Some("bot"));

        let (url, schema) = split_schema("postgres://db/x").unwrap();
        assert_eq!(url, "postgres://db/x");
        assert_eq!(schema, None);

        assert!(split_schema("postgres://db/x?schema=bad;drop").is_err());
        assert!(split_schema("postgres://db/x?schema=1abc").is_err());
    }
}
