//! [`Storage`] on SQLite.
//!
//! The schema and migration names match the old `@polycentric/js-storage-sqlite`
//! package, so databases written by the React Native and Node clients open
//! as-is. Databases written by the old kt-core `SqliteStorageDriver` (no
//! `__migrations` table, `keys` + `active_session` tables) are migrated the
//! same way.
//!
//! Blobs live in a directory when one is given (native), otherwise in a
//! `blobs` table (wasm, where there is no filesystem).

use std::sync::Mutex;

use polycentric_common::models::protos_v2::{
    Content, ContentDigest, Event, EventKey, PublicKey, SignedEvent, content::ContentBody,
};
use prost::Message;
use rusqlite::{Connection, OptionalExtension, Transaction, params};

use super::{
    LoginId, LoginOverview, LoginStatus, Page, Storage, StoredLogin, StoredPrivateKey,
    event_key_of, public_key_bytes,
};
use crate::lock::LockRecover;
use crate::sdk::error::{SdkError, SdkResult};

const LOCATION_INLINE: &str = "inline";
const LOCATION_SEALED: &str = "sealed";

pub struct SqliteStorage {
    conn: Mutex<Connection>,
    #[cfg(not(target_arch = "wasm32"))]
    blob_dir: Option<std::path::PathBuf>,
}

impl SqliteStorage {
    /// Open (creating if needed) the database at `path`, keeping blobs in
    /// `blob_dir` when given and in the database otherwise.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn open(
        path: impl AsRef<std::path::Path>,
        blob_dir: Option<std::path::PathBuf>,
    ) -> SdkResult<Self> {
        if let Some(parent) = path.as_ref().parent() {
            std::fs::create_dir_all(parent).map_err(|e| SdkError::Storage(e.to_string()))?;
        }
        if let Some(dir) = &blob_dir {
            std::fs::create_dir_all(dir).map_err(|e| SdkError::Storage(e.to_string()))?;
        }
        let conn = Connection::open(path)?;
        Self::from_connection(conn, blob_dir)
    }

    /// Open (creating if needed) the database file at `path` through Node's
    /// `fs` (see [`super::node_vfs`]). Blobs are kept in the database.
    #[cfg(target_arch = "wasm32")]
    pub fn open_node(path: &str) -> SdkResult<Self> {
        use rusqlite::OpenFlags;
        if !super::node_vfs::available() {
            return Err(SdkError::Storage(
                "file storage needs Node's fs; register it first".into(),
            ));
        }
        super::node_vfs::install()?;
        if let Some((dir, _)) = path.rsplit_once('/')
            && !dir.is_empty()
        {
            super::node_vfs::create_dir_all(dir)?;
        }
        let conn = Connection::open_with_flags_and_vfs(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
            super::node_vfs::VFS_NAME,
        )?;
        Self::from_connection(conn)
    }

    /// Open a database in the browser's origin private file system. Must run
    /// in a dedicated worker; the database file is exclusive to it.
    #[cfg(target_arch = "wasm32")]
    pub async fn open_opfs(name: &str) -> SdkResult<Self> {
        install_opfs_vfs().await?;
        let conn = Connection::open(format!("/{name}"))?;
        Self::from_connection(conn)
    }

    /// An empty database that lives only as long as this value.
    pub fn open_in_memory() -> SdkResult<Self> {
        let conn = Connection::open_in_memory()?;
        #[cfg(not(target_arch = "wasm32"))]
        return Self::from_connection(conn, None);
        #[cfg(target_arch = "wasm32")]
        return Self::from_connection(conn);
    }

    fn from_connection(
        mut conn: Connection,
        #[cfg(not(target_arch = "wasm32"))] blob_dir: Option<std::path::PathBuf>,
    ) -> SdkResult<Self> {
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        #[cfg(not(target_arch = "wasm32"))]
        conn.pragma_update(None, "journal_mode", "WAL")?;
        migrate(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            #[cfg(not(target_arch = "wasm32"))]
            blob_dir,
        })
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn blob_path(&self, digest: &ContentDigest) -> Option<std::path::PathBuf> {
        self.blob_dir.as_ref().map(|dir| dir.join(digest.to_id()))
    }
}

/// Register the OPFS "sync access handle pool" VFS as SQLite's default.
#[cfg(target_arch = "wasm32")]
async fn install_opfs_vfs() -> SdkResult<()> {
    use sqlite_wasm_rs::WasmOsCallback;
    use sqlite_wasm_vfs::sahpool::{OpfsSAHPoolCfg, install};

    static INSTALLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if INSTALLED.load(std::sync::atomic::Ordering::Acquire) {
        return Ok(());
    }
    install::<WasmOsCallback>(&OpfsSAHPoolCfg::default(), true)
        .await
        .map_err(|e| SdkError::Storage(format!("OPFS unavailable: {e:?}")))?;
    INSTALLED.store(true, std::sync::atomic::Ordering::Release);
    Ok(())
}

// ── Migrations ──────────────────────────────────────────────────────────

type Migration = (&'static str, fn(&Transaction) -> SdkResult<()>);

const MIGRATIONS: &[Migration] = &[
    ("m20260506_000001_initial", migrate_initial),
    (
        "m20261029_000001_login_repository",
        migrate_login_repository,
    ),
    ("m20261104_000001_blobs", migrate_blobs),
];

fn migrate(conn: &mut Connection) -> SdkResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS __migrations (
            name TEXT PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )",
    )?;
    for (name, up) in MIGRATIONS {
        let applied: bool = conn
            .query_row("SELECT 1 FROM __migrations WHERE name = ?1", [name], |_| {
                Ok(true)
            })
            .optional()?
            .unwrap_or(false);
        if applied {
            continue;
        }
        let tx = conn.transaction()?;
        up(&tx).map_err(|e| SdkError::Storage(format!("migration {name} failed: {e}")))?;
        tx.execute(
            "INSERT OR IGNORE INTO __migrations (name, applied_at) VALUES (?1, ?2)",
            params![name, crate::time::now_millis() as i64],
        )?;
        tx.commit()?;
    }
    Ok(())
}

fn migrate_initial(tx: &Transaction) -> SdkResult<()> {
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL,
            upgraded_on TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS active_identity_for_key (
            public_key BLOB PRIMARY KEY,
            identity_key TEXT
        );
        CREATE TABLE IF NOT EXISTS keys (
            public_key BLOB PRIMARY KEY,
            key_type INTEGER NOT NULL,
            private_key BLOB NOT NULL,
            CHECK (key_type >= 0),
            CHECK (LENGTH(private_key) = 32),
            CHECK (LENGTH(public_key) = 32)
        );
        CREATE TABLE IF NOT EXISTS events (
            identity TEXT NOT NULL,
            public_key_bytes BLOB NOT NULL,
            collection INTEGER NOT NULL,
            sequence INTEGER NOT NULL,
            signature BLOB NOT NULL,
            event_bytes BLOB NOT NULL,
            PRIMARY KEY (identity, public_key_bytes, collection, sequence)
        );
        CREATE TABLE IF NOT EXISTS content (
            digest_bytes BLOB PRIMARY KEY,
            content_bytes BLOB NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_events_identity ON events (identity);
        CREATE INDEX IF NOT EXISTS idx_events_identity_signer ON events (identity, public_key_bytes);
        CREATE INDEX IF NOT EXISTS idx_events_identity_signer_collection ON events (identity, public_key_bytes, collection);",
    )?;
    Ok(())
}

/// Replace `keys` with `logins`, keeping the old tables as `legacy_*`. The
/// first key pair bound to an identity becomes the active login. Databases
/// from the old kt-core driver also have `active_session`, naming the
/// signed-in identity; its key pair is preferred.
fn migrate_login_repository(tx: &Transaction) -> SdkResult<()> {
    tx.execute_batch(
        "ALTER TABLE keys RENAME TO legacy_keys;
        ALTER TABLE active_identity_for_key RENAME TO legacy_active_identity_for_key;
        CREATE TABLE logins (
            identity TEXT NOT NULL,
            key_type INTEGER NOT NULL,
            public_key BLOB NOT NULL,
            status TEXT NOT NULL,
            private_key_location TEXT NOT NULL,
            private_key BLOB NULL,
            private_key_token TEXT NULL,
            PRIMARY KEY (identity, key_type, public_key)
        );
        CREATE INDEX idx_logins_status ON logins (status);
        CREATE TABLE active_login (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            identity TEXT NOT NULL,
            key_type INTEGER NOT NULL,
            public_key BLOB NOT NULL
        );",
    )?;

    let session: Option<String> = if table_exists(tx, "active_session")? {
        tx.query_row(
            "SELECT identity_key FROM active_session WHERE id = 0",
            [],
            |row| row.get(0),
        )
        .optional()?
        .flatten()
    } else {
        None
    };

    let mut stmt = tx.prepare(
        "SELECT k.key_type, k.public_key, k.private_key, a.identity_key
        FROM legacy_keys k
        LEFT JOIN legacy_active_identity_for_key a ON a.public_key = k.public_key
        ORDER BY k.rowid",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, Vec<u8>>(1)?,
                row.get::<_, Vec<u8>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let chosen = match &session {
        Some(identity) => rows
            .iter()
            .find(|r| r.3.as_deref() == Some(identity.as_str())),
        None => rows.first(),
    };
    let Some((key_type, public_key, private_key, Some(identity))) = chosen.cloned() else {
        return Ok(());
    };

    let status = legacy_status(tx, &identity, key_type, &public_key);
    tx.execute(
        "INSERT INTO logins (identity, key_type, public_key, status, private_key_location, private_key)
        VALUES (?1, ?2, ?3, ?4, 'inline', ?5)",
        params![identity, key_type, public_key, status.as_str(), private_key],
    )?;
    tx.execute(
        "INSERT INTO active_login (id, identity, key_type, public_key) VALUES (1, ?1, ?2, ?3)",
        params![identity, key_type, public_key],
    )?;
    Ok(())
}

fn migrate_blobs(tx: &Transaction) -> SdkResult<()> {
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS blobs (
            digest_key TEXT PRIMARY KEY,
            bytes BLOB NOT NULL
        );",
    )?;
    Ok(())
}

fn table_exists(tx: &Transaction, name: &str) -> SdkResult<bool> {
    Ok(tx
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [name],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

/// The status of a legacy key pair, from the latest stored identity event.
/// Falls back to `LiveRotationKey` when it can't be told.
fn legacy_status(
    tx: &Transaction,
    identity: &str,
    key_type: i32,
    public_key: &[u8],
) -> LoginStatus {
    let lookup = || -> Option<LoginStatus> {
        let event_bytes: Vec<u8> = tx
            .query_row(
                "SELECT event_bytes FROM events WHERE identity = ?1 AND collection = 1
                ORDER BY sequence DESC LIMIT 1",
                [identity],
                |row| row.get(0),
            )
            .ok()?;
        let digest = Event::decode(event_bytes.as_slice()).ok()?.content_digest?;
        let content_bytes: Vec<u8> = tx
            .query_row(
                "SELECT content_bytes FROM content WHERE digest_bytes = ?1",
                [digest.encode_to_vec()],
                |row| row.get(0),
            )
            .ok()?;
        let Some(ContentBody::Identity(doc)) =
            Content::decode(content_bytes.as_slice()).ok()?.content_body
        else {
            return None;
        };
        let matches = |k: &PublicKey| k.key_type == key_type && k.key == public_key;
        Some(if doc.rotation_keys.iter().any(matches) {
            LoginStatus::LiveRotationKey
        } else if doc.signing_keys.iter().any(matches) {
            LoginStatus::LiveSigningKey
        } else {
            LoginStatus::Revoked
        })
    };
    lookup().unwrap_or(LoginStatus::LiveRotationKey)
}

// ── Row helpers ─────────────────────────────────────────────────────────

fn signed_event(signature: Vec<u8>, event_bytes: Vec<u8>) -> SignedEvent {
    SignedEvent {
        signature,
        event_bytes,
    }
}

fn split_key(key: &EventKey) -> SdkResult<(String, Vec<u8>, i32, i64)> {
    let signer = key
        .signed_by
        .as_ref()
        .ok_or_else(|| SdkError::InvalidInput("event key has no signer".into()))?;
    Ok((
        key.identity.clone(),
        public_key_bytes(signer),
        key.collection,
        key.sequence as i64,
    ))
}

fn login_key(id: &LoginId) -> (String, i32, Vec<u8>) {
    (
        id.identity.clone(),
        id.public_key.key_type,
        id.public_key.key.clone(),
    )
}

fn insert_event(conn: &Connection, event: &SignedEvent, or_ignore: bool) -> SdkResult<bool> {
    let key = event_key_of(event)?;
    let (identity, signer, collection, sequence) = split_key(&key)?;
    let sql = if or_ignore {
        "INSERT OR IGNORE INTO events (identity, public_key_bytes, collection, sequence, signature, event_bytes)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    } else {
        "INSERT INTO events (identity, public_key_bytes, collection, sequence, signature, event_bytes)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    };
    let changed = conn.execute(
        sql,
        params![
            identity,
            signer,
            collection,
            sequence,
            event.signature,
            event.event_bytes
        ],
    )?;
    Ok(changed > 0)
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait::async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait::async_trait(?Send))]
impl Storage for SqliteStorage {
    async fn put_events(&self, events: Vec<SignedEvent>) -> SdkResult<Vec<bool>> {
        let mut conn = self.conn.lock_recover();
        let tx = conn.transaction()?;
        let inserted = events
            .iter()
            .map(|e| insert_event(&tx, e, true))
            .collect::<SdkResult<Vec<_>>>()?;
        tx.commit()?;
        Ok(inserted)
    }

    async fn insert_own_event(&self, event: SignedEvent) -> SdkResult<()> {
        let conn = self.conn.lock_recover();
        insert_event(&conn, &event, false)?;
        Ok(())
    }

    async fn get_event(&self, key: EventKey) -> SdkResult<Option<SignedEvent>> {
        let (identity, signer, collection, sequence) = split_key(&key)?;
        let conn = self.conn.lock_recover();
        Ok(conn
            .query_row(
                "SELECT signature, event_bytes FROM events
                WHERE identity = ?1 AND public_key_bytes = ?2 AND collection = ?3 AND sequence = ?4",
                params![identity, signer, collection, sequence],
                |row| Ok(signed_event(row.get(0)?, row.get(1)?)),
            )
            .optional()?)
    }

    async fn heads(&self, identity: String) -> SdkResult<Vec<EventKey>> {
        let conn = self.conn.lock_recover();
        let mut stmt = conn.prepare(
            "SELECT public_key_bytes, collection, MAX(sequence) FROM events
            WHERE identity = ?1 GROUP BY public_key_bytes, collection",
        )?;
        let rows = stmt
            .query_map([&identity], |row| {
                Ok((
                    row.get::<_, Vec<u8>>(0)?,
                    row.get::<_, i32>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows.into_iter()
            .map(|(signer, collection, sequence)| {
                Ok(EventKey {
                    collection,
                    identity: identity.clone(),
                    signed_by: Some(PublicKey::decode(signer.as_slice())?),
                    sequence: sequence as u64,
                })
            })
            .collect()
    }

    async fn stream_events(
        &self,
        identity: String,
        collection: i32,
        signer: PublicKey,
        after_sequence: u64,
    ) -> SdkResult<Vec<SignedEvent>> {
        let conn = self.conn.lock_recover();
        let mut stmt = conn.prepare(
            "SELECT signature, event_bytes FROM events
            WHERE identity = ?1 AND public_key_bytes = ?2 AND collection = ?3 AND sequence > ?4
            ORDER BY sequence",
        )?;
        Ok(stmt
            .query_map(
                params![
                    identity,
                    public_key_bytes(&signer),
                    collection,
                    after_sequence as i64
                ],
                |row| Ok(signed_event(row.get(0)?, row.get(1)?)),
            )?
            .collect::<Result<Vec<_>, _>>()?)
    }

    async fn events_page(&self, after: Option<i64>, limit: u32) -> SdkResult<Page<SignedEvent>> {
        let conn = self.conn.lock_recover();
        let mut stmt = conn.prepare(
            "SELECT rowid, signature, event_bytes FROM events WHERE rowid > ?1 ORDER BY rowid LIMIT ?2",
        )?;
        let rows = stmt
            .query_map(params![after.unwrap_or(0), limit], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    signed_event(row.get(1)?, row.get(2)?),
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let next = (rows.len() as u32 == limit)
            .then(|| rows.last().map(|r| r.0))
            .flatten();
        Ok(Page {
            items: rows.into_iter().map(|r| r.1).collect(),
            next,
        })
    }

    async fn put_contents(&self, contents: Vec<(ContentDigest, Vec<u8>)>) -> SdkResult<()> {
        let mut conn = self.conn.lock_recover();
        let tx = conn.transaction()?;
        for (digest, bytes) in contents {
            tx.execute(
                "INSERT OR IGNORE INTO content (digest_bytes, content_bytes) VALUES (?1, ?2)",
                params![digest.encode_to_vec(), bytes],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    async fn get_content(&self, digest: ContentDigest) -> SdkResult<Option<Vec<u8>>> {
        let conn = self.conn.lock_recover();
        Ok(conn
            .query_row(
                "SELECT content_bytes FROM content WHERE digest_bytes = ?1",
                [digest.encode_to_vec()],
                |row| row.get(0),
            )
            .optional()?)
    }

    async fn contents_page(
        &self,
        after: Option<i64>,
        limit: u32,
    ) -> SdkResult<Page<(ContentDigest, Vec<u8>)>> {
        let conn = self.conn.lock_recover();
        let mut stmt = conn.prepare(
            "SELECT rowid, digest_bytes, content_bytes FROM content WHERE rowid > ?1 ORDER BY rowid LIMIT ?2",
        )?;
        let rows = stmt
            .query_map(params![after.unwrap_or(0), limit], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Vec<u8>>(1)?,
                    row.get::<_, Vec<u8>>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let next = (rows.len() as u32 == limit)
            .then(|| rows.last().map(|r| r.0))
            .flatten();
        let items = rows
            .into_iter()
            .map(|(_, digest, bytes)| Ok((ContentDigest::decode(digest.as_slice())?, bytes)))
            .collect::<SdkResult<Vec<_>>>()?;
        Ok(Page { items, next })
    }

    async fn put_login(&self, login: StoredLogin) -> SdkResult<()> {
        let (identity, key_type, public_key) = login_key(&login.id);
        let (location, private_key) = match login.private_key {
            StoredPrivateKey::Inline(bytes) => (LOCATION_INLINE, bytes),
            StoredPrivateKey::Sealed(bytes) => (LOCATION_SEALED, bytes),
        };
        let conn = self.conn.lock_recover();
        conn.execute(
            "INSERT INTO logins (identity, key_type, public_key, status, private_key_location, private_key)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                identity,
                key_type,
                public_key,
                login.status.as_str(),
                location,
                private_key
            ],
        )?;
        Ok(())
    }

    async fn set_login_status(&self, id: LoginId, status: LoginStatus) -> SdkResult<()> {
        let (identity, key_type, public_key) = login_key(&id);
        let conn = self.conn.lock_recover();
        let changed = conn.execute(
            "UPDATE logins SET status = ?4
            WHERE identity = ?1 AND key_type = ?2 AND public_key = ?3 AND status <> 'pendingDeletion'",
            params![identity, key_type, public_key, status.as_str()],
        )?;
        if changed == 0 {
            return Err(SdkError::NotFound(format!("login for {identity}")));
        }
        Ok(())
    }

    async fn set_login_key(&self, id: LoginId, private_key: StoredPrivateKey) -> SdkResult<()> {
        let (identity, key_type, public_key) = login_key(&id);
        let (location, private_key) = match private_key {
            StoredPrivateKey::Inline(bytes) => (LOCATION_INLINE, bytes),
            StoredPrivateKey::Sealed(bytes) => (LOCATION_SEALED, bytes),
        };
        let conn = self.conn.lock_recover();
        let changed = conn.execute(
            "UPDATE logins SET private_key_location = ?4, private_key = ?5, private_key_token = NULL
            WHERE identity = ?1 AND key_type = ?2 AND public_key = ?3",
            params![identity, key_type, public_key, location, private_key],
        )?;
        if changed == 0 {
            return Err(SdkError::NotFound(format!("login for {identity}")));
        }
        Ok(())
    }

    async fn list_logins(&self, identity: Option<String>) -> SdkResult<Vec<LoginOverview>> {
        let conn = self.conn.lock_recover();
        let mut stmt = conn.prepare(
            "SELECT identity, key_type, public_key, status FROM logins
            WHERE status <> 'pendingDeletion' AND (?1 IS NULL OR identity = ?1)
            ORDER BY rowid",
        )?;
        let rows = stmt
            .query_map([identity], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i32>(1)?,
                    row.get::<_, Vec<u8>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows.into_iter()
            .map(|(identity, key_type, key, status)| {
                Ok(LoginOverview {
                    id: LoginId {
                        identity,
                        public_key: PublicKey { key_type, key },
                    },
                    status: LoginStatus::parse(&status)?,
                })
            })
            .collect()
    }

    async fn get_login(&self, id: LoginId) -> SdkResult<Option<StoredLogin>> {
        let (identity, key_type, public_key) = login_key(&id);
        let conn = self.conn.lock_recover();
        let row = conn
            .query_row(
                "SELECT status, private_key_location, private_key FROM logins
                WHERE identity = ?1 AND key_type = ?2 AND public_key = ?3 AND status <> 'pendingDeletion'",
                params![identity, key_type, public_key],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<Vec<u8>>>(2)?,
                    ))
                },
            )
            .optional()?;
        let Some((status, location, private_key)) = row else {
            return Ok(None);
        };
        let private_key =
            private_key.ok_or_else(|| SdkError::Storage("login has no private key".into()))?;
        let private_key = match location.as_str() {
            LOCATION_INLINE => StoredPrivateKey::Inline(private_key),
            LOCATION_SEALED => StoredPrivateKey::Sealed(private_key),
            other => {
                return Err(SdkError::Storage(format!(
                    "unsupported private key location: {other}"
                )));
            }
        };
        Ok(Some(StoredLogin {
            id,
            status: LoginStatus::parse(&status)?,
            private_key,
        }))
    }

    async fn delete_login(&self, id: LoginId) -> SdkResult<()> {
        let (identity, key_type, public_key) = login_key(&id);
        let mut conn = self.conn.lock_recover();
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM logins WHERE identity = ?1 AND key_type = ?2 AND public_key = ?3",
            params![identity, key_type, public_key],
        )?;
        tx.execute(
            "DELETE FROM active_login WHERE identity = ?1 AND key_type = ?2 AND public_key = ?3",
            params![identity, key_type, public_key],
        )?;
        tx.commit()?;
        Ok(())
    }

    async fn set_active_login(&self, id: Option<LoginId>) -> SdkResult<()> {
        let mut conn = self.conn.lock_recover();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM active_login", [])?;
        if let Some(id) = id {
            let (identity, key_type, public_key) = login_key(&id);
            tx.execute(
                "INSERT INTO active_login (id, identity, key_type, public_key) VALUES (1, ?1, ?2, ?3)",
                params![identity, key_type, public_key],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    async fn active_login(&self) -> SdkResult<Option<LoginId>> {
        let conn = self.conn.lock_recover();
        Ok(conn
            .query_row(
                "SELECT identity, key_type, public_key FROM active_login WHERE id = 1",
                [],
                |row| {
                    Ok(LoginId {
                        identity: row.get(0)?,
                        public_key: PublicKey {
                            key_type: row.get(1)?,
                            key: row.get(2)?,
                        },
                    })
                },
            )
            .optional()?)
    }

    async fn has_blob(&self, digest: ContentDigest) -> SdkResult<bool> {
        #[cfg(not(target_arch = "wasm32"))]
        if let Some(path) = self.blob_path(&digest) {
            return Ok(path.is_file());
        }
        let conn = self.conn.lock_recover();
        Ok(conn
            .query_row(
                "SELECT 1 FROM blobs WHERE digest_key = ?1",
                [digest.to_id()],
                |_| Ok(()),
            )
            .optional()?
            .is_some())
    }

    async fn get_blob(&self, digest: ContentDigest) -> SdkResult<Option<Vec<u8>>> {
        #[cfg(not(target_arch = "wasm32"))]
        if let Some(path) = self.blob_path(&digest) {
            return match std::fs::read(&path) {
                Ok(bytes) => Ok(Some(bytes)),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(e) => Err(SdkError::Storage(e.to_string())),
            };
        }
        let conn = self.conn.lock_recover();
        Ok(conn
            .query_row(
                "SELECT bytes FROM blobs WHERE digest_key = ?1",
                [digest.to_id()],
                |row| row.get(0),
            )
            .optional()?)
    }

    async fn put_blob(&self, digest: ContentDigest, bytes: Vec<u8>) -> SdkResult<()> {
        #[cfg(not(target_arch = "wasm32"))]
        if let Some(path) = self.blob_path(&digest) {
            // Write to a temporary name and rename, so a crash never leaves a
            // truncated blob under its digest.
            let tmp = path.with_extension(format!("tmp-{}", crate::time::now_millis()));
            std::fs::write(&tmp, &bytes).map_err(|e| SdkError::Storage(e.to_string()))?;
            return std::fs::rename(&tmp, &path).map_err(|e| SdkError::Storage(e.to_string()));
        }
        let conn = self.conn.lock_recover();
        conn.execute(
            "INSERT OR REPLACE INTO blobs (digest_key, bytes) VALUES (?1, ?2)",
            params![digest.to_id(), bytes],
        )?;
        Ok(())
    }

    async fn delete_blob(&self, digest: ContentDigest) -> SdkResult<bool> {
        #[cfg(not(target_arch = "wasm32"))]
        if let Some(path) = self.blob_path(&digest) {
            return match std::fs::remove_file(&path) {
                Ok(()) => Ok(true),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
                Err(e) => Err(SdkError::Storage(e.to_string())),
            };
        }
        let conn = self.conn.lock_recover();
        Ok(conn.execute("DELETE FROM blobs WHERE digest_key = ?1", [digest.to_id()])? > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn conformance_in_memory() {
        let storage = SqliteStorage::open_in_memory().unwrap();
        super::super::tests::conformance(&storage).await;
    }

    #[tokio::test]
    async fn conformance_on_disk_with_blob_dir() {
        let dir = tempfile::tempdir().unwrap();
        let storage =
            SqliteStorage::open(dir.path().join("db.sqlite"), Some(dir.path().join("blobs")))
                .unwrap();
        super::super::tests::conformance(&storage).await;
    }

    #[tokio::test]
    async fn migrations_are_idempotent_across_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("db.sqlite");
        {
            let storage = SqliteStorage::open(&path, None).unwrap();
            storage
                .put_events(vec![super::super::tests::event(&"a".repeat(64), 1, 2, 1)])
                .await
                .unwrap();
        }
        let storage = SqliteStorage::open(&path, None).unwrap();
        assert_eq!(storage.heads("a".repeat(64)).await.unwrap().len(), 1);
    }

    /// A database from the old kt-core driver: `keys`, `active_identity_for_key`
    /// and `active_session`, no `__migrations`.
    #[tokio::test]
    async fn migrates_kt_core_database() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("kt.sqlite");
        let identity = "c".repeat(64);
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE schema_version (version INTEGER NOT NULL, upgraded_on TEXT NOT NULL);
                CREATE TABLE active_identity_for_key (public_key BLOB PRIMARY KEY, identity_key TEXT);
                CREATE TABLE active_session (id INTEGER PRIMARY KEY CHECK (id = 0), identity_key TEXT);
                CREATE TABLE keys (public_key BLOB PRIMARY KEY, key_type INTEGER NOT NULL, private_key BLOB NOT NULL);
                CREATE TABLE events (identity TEXT NOT NULL, public_key_bytes BLOB NOT NULL, collection INTEGER NOT NULL,
                    sequence INTEGER NOT NULL, signature BLOB NOT NULL, event_bytes BLOB NOT NULL,
                    PRIMARY KEY (identity, public_key_bytes, collection, sequence));
                CREATE TABLE content (digest_bytes BLOB PRIMARY KEY, content_bytes BLOB NOT NULL);",
            )
            .unwrap();
            // Two keys; the session points at the second one's identity.
            conn.execute(
                "INSERT INTO keys VALUES (?1, 1, ?2)",
                params![vec![1u8; 32], vec![11u8; 32]],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO keys VALUES (?1, 1, ?2)",
                params![vec![2u8; 32], vec![22u8; 32]],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO active_identity_for_key VALUES (?1, ?2)",
                params![vec![1u8; 32], "d".repeat(64)],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO active_identity_for_key VALUES (?1, ?2)",
                params![vec![2u8; 32], identity],
            )
            .unwrap();
            conn.execute("INSERT INTO active_session VALUES (0, ?1)", [&identity])
                .unwrap();
        }

        let storage = SqliteStorage::open(&path, None).unwrap();
        let active = storage.active_login().await.unwrap().unwrap();
        assert_eq!(active.identity, identity);
        assert_eq!(active.public_key.key, vec![2u8; 32]);
        let login = storage.get_login(active).await.unwrap().unwrap();
        assert_eq!(login.private_key, StoredPrivateKey::Inline(vec![22u8; 32]));
        assert_eq!(login.status, LoginStatus::LiveRotationKey);
    }
}
