import sqlite3 from 'sqlite3';
import fs from 'node:fs';
import type { DatabaseSchema } from '@polycentric/js-core';
import { DatabaseError, polycentricSchema } from '@polycentric/js-core';
import path from 'node:path';

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
 * SQLite database implementation
 */
export class NodeSQLiteDatabase {
  private db: sqlite3.Database | null = null;
  private isInitialized = false;

  private readonly schema: DatabaseSchema;
  private readonly databaseName: string;
  private readonly databaseDir: string;

  /**
   * Checks if a database name will be a valid file name
   */
  private static isValidDatabaseName(databaseName: string): boolean {
    // This could probably just be a single regex but debugging complex regexes is hard.
    if (!databaseName || databaseName.length === 0) {
      return false;
    }

    if (databaseName.charAt(0) === '.') {
      return false;
    }

    for (const char of databaseName) {
      if (
        !(
          /[a-z]/i.test(char) ||
          /\d/.test(char) ||
          char === '-' ||
          char === '.'
        )
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Create a new SQLite database
   *
   * @param databaseName - The name of the database
   * @param schema - Optional database schema, overrides the default polycentric schema
   * @throws {DatabaseError} if database name is empty
   */
  constructor(
    databaseName: string,
    databaseDir?: string,
    customSchema?: DatabaseSchema,
  ) {
    if (!NodeSQLiteDatabase.isValidDatabaseName(databaseName)) {
      throw new DatabaseError(`Invalid database name: ${databaseName}`);
    }

    this.databaseName = databaseName;
    this.databaseDir = databaseDir ?? 'sqlite/';
    this.schema = customSchema ?? polycentricSchema;
  }

  private getDatabaseFilePath(): string {
    return path.join(this.databaseDir, `${this.databaseName}.sqlite3`);
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
      const dbFilePath = this.getDatabaseFilePath();
      await fs.promises.mkdir(path.dirname(dbFilePath), { recursive: true });
      await fs.promises.appendFile(dbFilePath, ''); //Create the sqlite file if it doesn't exist

      this.db = await new Promise<sqlite3.Database>((resolve, reject) => {
        const db = new sqlite3.Database(
          dbFilePath,
          sqlite3.OPEN_READWRITE,
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve(db);
            }
          },
        );
      });

      this.isInitialized = true;
      await this.initializeSchema();
    } catch (error) {
      throw new DatabaseError(
        `Failed to initialize SQLite database '${this.databaseName}': ${error}`,
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
    return await new Promise((resolve, reject) => {
      if (!this.isInitialized || !this.db) {
        throw new DatabaseError('Database not initialized');
      }

      this.db.all(query, params, (err: Error | null, rows: T[]) => {
        if (err) {
          reject(
            new DatabaseError(`Query execution failed: ${err.message}`, err),
          );
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Execute a query that doesn't return results
   *
   * @param query - SQL query string
   * @param params - Query parameters
   * @throws {DatabaseError} if the database is not initialized or if execution fails
   */
  async executeNonQuery(query: string, params: unknown[] = []): Promise<void> {
    await new Promise((resolve, reject) => {
      if (!this.isInitialized || !this.db) {
        throw new DatabaseError('Database not initialized');
      }

      this.db.run(query, params, (err: Error | null) => {
        if (err) {
          reject(
            new DatabaseError(
              `Non-query execution failed: ${err.message}`,
              err,
            ),
          );
        } else {
          resolve(undefined);
        }
      });
    });
  }

  /**
   * Close the database connection
   *
   * @throws {DatabaseError} if database close fails
   */
  async close(): Promise<void> {
    try {
      await new Promise((resolve, reject) => {
        if (!this.db) {
          // Already closed, this is ok
          this.isInitialized = false;
          resolve(undefined);
          return;
        }

        this.db.close((err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve(undefined);
          }
        });
      });
    } catch (error) {
      throw new DatabaseError(
        `Failed to close database '${this.databaseName}': ${error}`,
        error,
      );
    } finally {
      this.db = null;
      this.isInitialized = false;
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
 * Create a new SQLite database instance.
 *
 * This method creates a standalone database. It allows for
 * simpler isolation for testing purposes.
 *
 * This method should not be used in practice.
 * In practice create a BrowserStorage instance.
 *
 * @param databaseName - The name of the database
 * @param customSchema - Optional database schema, overrides the default polycentric schema
 * @returns Promise that resolves to a new SQLite database instance
 */
export const _createNodeSQLiteDatabase = async (
  databaseName: string,
  databaseDir?: string,
  customSchema?: DatabaseSchema,
) => {
  const database = new NodeSQLiteDatabase(
    databaseName,
    databaseDir,
    customSchema,
  );
  await database.initialize();
  return database;
};
