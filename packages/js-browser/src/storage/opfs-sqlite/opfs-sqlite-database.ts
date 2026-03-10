// @ts-expect-error - sqlite-wasm doesn't export a type. PR: https://github.com/sqlite/sqlite-wasm/pull/54
import { sqlite3Worker1Promiser } from '@sqlite.org/sqlite-wasm';
import type { DatabaseSchema } from '@polycentric/js-core';
import { DatabaseError, polycentricSchema } from '@polycentric/js-core';

/**
 * Information about a found database.
 */
export interface DatabaseInfo {
  /** Database name */
  name: string;
  /** Database file path */
  filename: string;
  /** Database last modified date (if available) */
  lastModified?: Date;
  /** Database size in bytes (if available) */
  size?: number;
}

/**
 * OPFS SQLite database implementation
 */
export class OPFSSQLiteDatabase {
  // SQLite doesn't export Promiser type at this time. PR: https://github.com/sqlite/sqlite-wasm/pull/54
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private promiser: any;
  private dbId: string | null = null;
  private isInitialized = false;

  private readonly schema: DatabaseSchema;
  private readonly databaseName: string;

  /**
   * Create a new OPFS SQLite database
   *
   * @param databaseName - The name of the database
   * @param schema - Optional database schema, overrides the default polycentric schema
   * @throws {DatabaseError} if database name is empty
   */
  constructor(databaseName: string, customSchema?: DatabaseSchema) {
    if (!databaseName || databaseName.trim().length === 0) {
      throw new DatabaseError('Database name cannot be empty');
    }

    this.databaseName = databaseName;
    this.schema = customSchema ?? polycentricSchema;
  }

  /**
   * List all SQLite databases in the OPFS
   *
   * @param prefix - Optional prefix to filter databases by name
   * @param sorted - Sort databases by last modified date (default: true)
   * @returns Promise that resolves to DatabaseInfo[]
   * @throws {DatabaseError} if OPFS scanning fails indicating a possible
   * issue with the browser's OPFS support
   *
   */
  static async listDatabases(
    prefix?: string,
    sorted = true,
  ): Promise<DatabaseInfo[]> {
    try {
      const opfsRoot = await navigator.storage.getDirectory();
      const databases: DatabaseInfo[] = [];

      // TypeScript doesn't have complete OPFS type definitions yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const directoryIterator = (opfsRoot as any).values();

      for await (const handle of directoryIterator) {
        if (handle.kind === 'file') {
          const name = handle.name;

          if (name.endsWith('.sqlite3')) {
            const dbName = name.replace('.sqlite3', '');

            if (prefix && !dbName.startsWith(prefix)) {
              continue;
            }

            try {
              const file = await (handle as FileSystemFileHandle).getFile();
              databases.push({
                name: dbName,
                filename: name,
                lastModified: new Date(file.lastModified),
                size: file.size,
              });
            } catch {
              databases.push({
                name: dbName,
                filename: name,
              });
            }
          }
        }
      }

      if (sorted) {
        databases.sort((a, b) => {
          if (a.lastModified && b.lastModified) {
            return b.lastModified.getTime() - a.lastModified.getTime();
          }
          if (a.lastModified && !b.lastModified) return -1;
          if (!a.lastModified && b.lastModified) return 1;
          return a.name.localeCompare(b.name);
        });
      }

      return databases;
    } catch (error) {
      throw new DatabaseError(
        'Failed to scan OPFS for database files - OPFS may not be supported in this browser',
        error,
      );
    }
  }

  /**
   * Initialize the database connection and schema
   *
   * @throws {DatabaseError} if initialization fails
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.promiser = await new Promise((resolve) => {
        const _promiser = sqlite3Worker1Promiser({
          onready: () => resolve(_promiser),
        });
      });

      const openResponse = await this.promiser('open', {
        filename: `file:${this.databaseName}.sqlite3?vfs=opfs`,
      });

      this.dbId = openResponse.dbId ?? null;
      if (!this.dbId) {
        throw new DatabaseError('SQLite worker failed to return a database ID');
      }

      this.isInitialized = true;
      await this.initializeSchema();
    } catch (error) {
      const sqliteError = error as { result?: { message?: string } };
      const errorMessage = sqliteError?.result?.message ?? String(error);

      throw new DatabaseError(
        `Failed to initialize SQLite database '${this.databaseName}': ${errorMessage}`,
        error,
      );
    }
  }

  /**
   * Begin a database transaction
   *
   * @throws {DatabaseError} if transaction fails
   */
  async beginTransaction(): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Commit the current transaction
   *
   * @throws {DatabaseError} if commit fails
   */
  async commitTransaction(): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Rollback the current transaction
   *
   * @throws {DatabaseError} if rollback fails
   */
  async rollbackTransaction(): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Execute operations within a transaction
   * Automatically handles begin/commit/rollback
   *
   * @param operation - The operation to execute within the transaction
   * @throws {DatabaseError} if transaction fails
   * @returns The result of the operation
   */
  async executeInTransaction<T>(operation: () => Promise<T>): Promise<T> {
    throw new Error('Not implemented: ' + operation);
  }

  /**
   * Initialize database schema
   */
  private async initializeSchema(): Promise<void> {
    for (const table of this.schema.tables) {
      await this.executeNonQuery(table);
    }

    for (const index of this.schema.indexes) {
      await this.executeNonQuery(index);
    }

    if (this.schema.views) {
      for (const view of this.schema.views) {
        await this.executeNonQuery(view);
      }
    }
  }

  /**
   * Execute a query that returns results
   *
   * @param query - SQL query string
   * @param params - Query parameters
   * @throws {DatabaseError} if the database is not initialized or if execution fails
   * @returns Promise that resolves to query results
   */
  async executeQuery<T>(query: string, params: unknown[] = []): Promise<T[]> {
    if (!this.isInitialized || !this.dbId || !this.promiser) {
      throw new DatabaseError('Database not initialized');
    }

    try {
      const response = await this.promiser('exec', {
        dbId: this.dbId,
        sql: query,
        bind: params,
        rowMode: 'object',
      });

      return (response.result?.resultRows as T[]) ?? [];
    } catch (error) {
      const sqliteError = error as { result?: { message?: string } };
      const errorMessage = sqliteError?.result?.message ?? String(error);

      throw new DatabaseError(`Query execution failed: ${errorMessage}`, error);
    }
  }

  /**
   * Execute a query that doesn't return results
   *
   * @param query - SQL query string
   * @param params - Query parameters
   * @throws {DatabaseError} if the database is not initialized or if execution fails
   */
  async executeNonQuery(query: string, params: unknown[] = []): Promise<void> {
    if (!this.isInitialized || !this.dbId || !this.promiser) {
      throw new DatabaseError('Database not initialized');
    }

    try {
      await this.promiser('exec', {
        dbId: this.dbId,
        sql: query,
        bind: params,
      });
    } catch (error) {
      const sqliteError = error as { result?: { message?: string } };
      const errorMessage = sqliteError?.result?.message ?? String(error);

      throw new DatabaseError(
        `Non-query execution failed: ${errorMessage}`,
        error,
      );
    }
  }

  /**
   * Close the database connection
   *
   * @throws {DatabaseError} if database close fails
   */
  async close(): Promise<void> {
    if (!this.dbId || !this.promiser) {
      // Already closed, this is ok
      this.isInitialized = false;
      return;
    }

    try {
      await this.promiser('close', { dbId: this.dbId });
    } catch (error) {
      const sqliteError = error as { result?: { message?: string } };
      const errorMessage = sqliteError?.result?.message ?? String(error);

      throw new DatabaseError(
        `Failed to close database '${this.databaseName}': ${errorMessage}`,
        error,
      );
    } finally {
      // Reset state, even on error
      this.dbId = null;
      this.isInitialized = false;
    }
  }

  /**
   * Delete a database file from OPFS
   *
   * @param name - Name of the database to delete (without .sqlite3 extension)
   * @throws {DatabaseError} if database deletion fails
   */
  static async deleteDatabase(name: string): Promise<void> {
    try {
      const opfsRoot = await navigator.storage.getDirectory();
      const filename = `${name}.sqlite3`;

      await opfsRoot.removeEntry(filename);
    } catch (error) {
      throw new DatabaseError(
        `Failed to delete database '${name}' from OPFS`,
        error,
      );
    }
  }

  /**
   * Check if the database is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the database name
   */
  get name(): string {
    return this.databaseName;
  }
}

/**
 * Create a new OPFS SQLite database instance.
 *
 * @param databaseName - The name of the database
 * @param customSchema - Optional database schema, overrides the default polycentric schema
 * @returns Promise that resolves to a new OPFS SQLite database instance
 */
export const _createOPFSSQLiteDatabase = async (
  databaseName: string,
  customSchema?: DatabaseSchema,
) => {
  const database = new OPFSSQLiteDatabase(databaseName, customSchema);
  await database.initialize();
  return database;
};
