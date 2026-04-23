export interface DatabaseSchema {
  tables: string[];
  indexes: string[];
  views?: string[];
}

export const schemaV1: DatabaseSchema = {
  tables: [
    `CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL,
        upgraded_on TEXT NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS active_identity_for_key (
        public_key BLOB PRIMARY KEY,
        identity_key TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS keys (
        public_key BLOB PRIMARY KEY,
        key_type INTEGER NOT NULL,
        private_key BLOB NOT NULL,

        CHECK (key_type >= 0),
        CHECK (LENGTH(private_key) = 32),
        CHECK (LENGTH(public_key) = 32)
    )`,

    `CREATE TABLE IF NOT EXISTS events (
        identity TEXT NOT NULL,
        public_key_bytes BLOB NOT NULL,
        collection INTEGER NOT NULL,
        sequence INTEGER NOT NULL,
        signature BLOB NOT NULL,
        event_bytes BLOB NOT NULL,

        PRIMARY KEY (identity, public_key_bytes, collection, sequence)
    )`,

    `CREATE TABLE IF NOT EXISTS content (
        digest_bytes BLOB PRIMARY KEY,
        content_bytes BLOB NOT NULL
    )`,
  ],
  views: [],
  indexes: [
    `CREATE INDEX IF NOT EXISTS idx_events_identity
     ON events (identity)`,

    `CREATE INDEX IF NOT EXISTS idx_events_identity_signer
     ON events (identity, public_key_bytes)`,

    `CREATE INDEX IF NOT EXISTS idx_events_identity_signer_collection
     ON events (identity, public_key_bytes, collection)`,
  ],
};
