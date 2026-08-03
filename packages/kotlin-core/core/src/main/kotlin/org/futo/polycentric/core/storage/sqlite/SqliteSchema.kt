package org.futo.polycentric.core.storage.sqlite

/**
 * SQLite schema for the v2 storage driver — a direct port of
 * `@polycentric/js-storage-sqlite`'s initial migration
 * (`m20260506_000001_initial`). Kept byte-for-byte compatible so the two
 * stacks describe the same store:
 *
 *  - `events` keyed by (identity, public_key_bytes, collection, sequence),
 *    where `public_key_bytes` is the serialized `PublicKey` proto and the
 *    signature + event bytes are stored separately.
 *  - `content` addressed by the serialized `ContentDigest`.
 *  - `keys` keyed by the raw public-key bytes.
 *  - `active_identity_for_key` mapping a device key to its v2 identity.
 *
 * The Rust core owns tombstoning/validation/clocks, so nothing here
 * interprets event contents. Blobs are NOT stored here — they live in a
 * filesystem-backed [org.futo.polycentric.core.platform.IFileStoreDriver],
 * exactly as js keeps them out of the SQLite store.
 */
internal object SqliteSchema {
    const val VERSION = 1

    val tables = listOf(
        """CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL,
            upgraded_on TEXT NOT NULL
        )""",

        """CREATE TABLE IF NOT EXISTS active_identity_for_key (
            public_key BLOB PRIMARY KEY,
            identity_key TEXT
        )""",

        """CREATE TABLE IF NOT EXISTS keys (
            public_key BLOB PRIMARY KEY,
            key_type INTEGER NOT NULL,
            private_key BLOB NOT NULL,
            CHECK (key_type >= 0),
            CHECK (LENGTH(private_key) = 32),
            CHECK (LENGTH(public_key) = 32)
        )""",

        """CREATE TABLE IF NOT EXISTS events (
            identity TEXT NOT NULL,
            public_key_bytes BLOB NOT NULL,
            collection INTEGER NOT NULL,
            sequence INTEGER NOT NULL,
            signature BLOB NOT NULL,
            event_bytes BLOB NOT NULL,
            PRIMARY KEY (identity, public_key_bytes, collection, sequence)
        )""",

        """CREATE TABLE IF NOT EXISTS content (
            digest_bytes BLOB PRIMARY KEY,
            content_bytes BLOB NOT NULL
        )""",
    )

    val indexes = listOf(
        "CREATE INDEX IF NOT EXISTS idx_events_identity ON events (identity)",
        "CREATE INDEX IF NOT EXISTS idx_events_identity_signer ON events (identity, public_key_bytes)",
        "CREATE INDEX IF NOT EXISTS idx_events_identity_signer_collection ON events (identity, public_key_bytes, collection)",
    )
}

/** Uppercase hex, matching SQLite's `hex()` for BLOB equality in WHERE clauses. */
internal fun ByteArray.toHexUpper(): String {
    val sb = StringBuilder(size * 2)
    for (b in this) sb.append("%02X".format(b))
    return sb.toString()
}
