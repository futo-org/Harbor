export interface DatabaseSchema {
  tables: string[];
  indexes: string[];
  views?: string[];
}

export const schemaV1: DatabaseSchema = {
  tables: [
    // Schema version
    `CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL,
        upgraded_on TEXT NOT NULL
    )`,

    // Keys table
    `CREATE TABLE IF NOT EXISTS keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_type INTEGER NOT NULL,
        private_key BLOB NOT NULL,
        public_key BLOB NOT NULL,

        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),

        CHECK (key_type >= 0),
        CHECK (LENGTH(private_key) = 32),
        CHECK (LENGTH(public_key) = 32),
        UNIQUE (key_type, private_key, public_key)
    )`,

    // Process ID - stores the device's unique process ID
    `CREATE TABLE IF NOT EXISTS process_id (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        process_id BLOB NOT NULL,

        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),

        CHECK (LENGTH(process_id) = 16)
    )`,

    // Events table
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      system_key_type INTEGER NOT NULL,
      system_key BLOB NOT NULL,
      process BLOB NOT NULL,
      logical_clock INTEGER NOT NULL,
      
      -- SignedEvent wrapper
      signature BLOB NOT NULL,
      raw_event BLOB NOT NULL,
      moderation_tags TEXT,
      
      -- Tombstone tracking
      is_tombstone INTEGER DEFAULT 0,
      mutation_pointer_system_key_type INTEGER,
      mutation_pointer_system_key BLOB,
      mutation_pointer_process BLOB,
      mutation_pointer_logical_clock INTEGER,
      
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      
      CHECK (system_key_type >= 0),
      CHECK (LENGTH(process) = 16),
      CHECK (logical_clock >= 0),
      CHECK (is_tombstone IN (0, 1)),
      UNIQUE (system_key_type, system_key, process, logical_clock)
    )`,

    // Event acknowledgments - tracks server sync state
    `CREATE TABLE IF NOT EXISTS event_acks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      system_key_type INTEGER NOT NULL,
      system_key BLOB NOT NULL,
      process BLOB NOT NULL,
      logical_clock INTEGER NOT NULL,
      servers TEXT NOT NULL,

      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      
      CHECK (system_key_type >= 0),
      CHECK (LENGTH(process) = 16),
      CHECK (logical_clock >= 0),
      UNIQUE (system_key_type, system_key, process, logical_clock)
    )`,

    // Process state table - for tracking current logical clock for a process
    `CREATE TABLE IF NOT EXISTS process_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        system_key_type INTEGER NOT NULL,
        system_key BLOB NOT NULL,
        process BLOB NOT NULL,
        logical_clock INTEGER NOT NULL,

        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),

        CHECK (system_key_type >= 0),
        CHECK (LENGTH(process) = 16),
        CHECK (logical_clock >= 0),
        UNIQUE (system_key_type, system_key, process)
    )`,
  ],
  views: [
    // Active events view - excludes tombstones by default
    `CREATE VIEW IF NOT EXISTS active_events AS
     SELECT e.*
     FROM events e
     WHERE e.is_tombstone = 0`,

    // Tombstone events view - only tombstones
    `CREATE VIEW IF NOT EXISTS tombstone_events AS
     SELECT e.*
     FROM events e
     WHERE e.is_tombstone = 1`,
  ],
  indexes: [
    // Core event lookup indices
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_events_natural_key
     ON events (system_key_type, system_key, process, logical_clock)`,

    `CREATE INDEX IF NOT EXISTS idx_events_system_key_type_system_key
     ON events (system_key_type, system_key)`,

    `CREATE INDEX IF NOT EXISTS idx_events_system_process
     ON events (system_key_type, system_key, process)`,

    `CREATE INDEX IF NOT EXISTS idx_events_created_at
     ON events (created_at DESC)`,

    // Tombstone indices
    `CREATE INDEX IF NOT EXISTS idx_events_tombstone
     ON events (is_tombstone) WHERE is_tombstone = 1`,

    `CREATE INDEX IF NOT EXISTS idx_events_mutation_pointer
     ON events (mutation_pointer_system_key_type, mutation_pointer_system_key, 
                mutation_pointer_process, mutation_pointer_logical_clock)
     WHERE is_tombstone = 1`,

    // Event acknowledgments indices
    `CREATE INDEX IF NOT EXISTS idx_event_acks_natural_key
     ON event_acks (system_key_type, system_key, process, logical_clock)`,

    `CREATE INDEX IF NOT EXISTS idx_event_acks_created_at
     ON event_acks (created_at DESC)`,

    `CREATE INDEX IF NOT EXISTS idx_event_acks_servers
     ON event_acks (servers)`,

    // Process state indices
    `CREATE INDEX IF NOT EXISTS idx_process_state_natural_key
     ON process_state (system_key_type, system_key, process)`,

    `CREATE INDEX IF NOT EXISTS idx_process_state_system_key_type_system_key
     ON process_state (system_key_type, system_key)`,

    `CREATE INDEX IF NOT EXISTS idx_process_state_updated_at
     ON process_state (updated_at DESC)`,
  ],
};
