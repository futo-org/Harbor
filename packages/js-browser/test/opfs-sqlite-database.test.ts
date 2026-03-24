import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _createOPFSSQLiteDatabase,
  OPFSSQLiteDatabase,
} from '@polycentric/js-browser/full';
import { DatabaseError } from '@polycentric/js-core';
import type { DatabaseSchema } from '@polycentric/js-core';

const testSchema: DatabaseSchema = {
  tables: [
    `CREATE TABLE IF NOT EXISTS test_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      value INTEGER DEFAULT 0
    )`,
  ],
  indexes: [
    `CREATE INDEX IF NOT EXISTS idx_test_items_name ON test_items (name)`,
  ],
};

interface TestItem {
  id: string;
  name: string;
  value: number;
}

describe('OPFSSQLiteDatabase', () => {
  let db: OPFSSQLiteDatabase;
  const dbName = `test-db-${Date.now()}`;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db = await _createOPFSSQLiteDatabase(dbName, testSchema);
    await db.initialize();
    await db.executeNonQuery('DELETE FROM test_items');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await db.close();
    } catch {
      // Ignore close errors in cleanup
    }
  });

  test('should throw error for empty database name', async () => {
    await expect(
      async () => await _createOPFSSQLiteDatabase(''),
    ).rejects.toThrow(DatabaseError);
    await expect(
      async () => await _createOPFSSQLiteDatabase('   '),
    ).rejects.toThrow(DatabaseError);
  });

  test('should initialize successfully', async () => {
    expect(db.initialized).toBe(true);
    expect(db.name).toBe(dbName);
  });

  test('should create schema tables and indexes', async () => {
    const tables = await db.executeQuery<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='test_items'",
    );
    expect(tables).toHaveLength(1);

    const indexes = await db.executeQuery<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_test_items_name'",
    );
    expect(indexes).toHaveLength(1);
  });

  test('should insert and retrieve data', async () => {
    await db.executeNonQuery(
      'INSERT INTO test_items (id, name, value) VALUES (?, ?, ?)',
      ['item1', 'Test Item', 42],
    );

    const results = await db.executeQuery<TestItem>(
      'SELECT * FROM test_items WHERE id = ?',
      ['item1'],
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: 'item1',
      name: 'Test Item',
      value: 42,
    });
  });

  test('should update existing data', async () => {
    await db.executeNonQuery(
      'INSERT INTO test_items (id, name, value) VALUES (?, ?, ?)',
      ['item2', 'Original', 10],
    );

    await db.executeNonQuery(
      'UPDATE test_items SET name = ?, value = ? WHERE id = ?',
      ['Updated', 20, 'item2'],
    );

    const results = await db.executeQuery<TestItem>(
      'SELECT * FROM test_items WHERE id = ?',
      ['item2'],
    );

    expect(results[0]).toEqual({
      id: 'item2',
      name: 'Updated',
      value: 20,
    });
  });

  test('should delete data', async () => {
    await db.executeNonQuery(
      'INSERT INTO test_items (id, name, value) VALUES (?, ?, ?)',
      ['item3', 'To Delete', 5],
    );

    await db.executeNonQuery('DELETE FROM test_items WHERE id = ?', ['item3']);

    const results = await db.executeQuery<TestItem>(
      'SELECT * FROM test_items WHERE id = ?',
      ['item3'],
    );
    expect(results).toHaveLength(0);
  });

  test('should return empty array for non-existent data', async () => {
    const results = await db.executeQuery<TestItem>(
      'SELECT * FROM test_items WHERE id = ?',
      ['nonexistent'],
    );
    expect(results).toEqual([]);
  });

  test('should throw DatabaseError for invalid SQL', async () => {
    await expect(
      db.executeQuery('SELECT * FROM nonexistent_table'),
    ).rejects.toThrow(DatabaseError);

    await expect(
      db.executeNonQuery('INSERT INTO nonexistent_table (id) VALUES (?)', [
        'test',
      ]),
    ).rejects.toThrow(DatabaseError);
  });

  test('should throw DatabaseError when operating on uninitialized database', async () => {
    const uninitializedDb = await _createOPFSSQLiteDatabase(
      'uninitialized',
      testSchema,
    );

    await uninitializedDb.close(); // Close database connection to force unitialized state

    await expect(uninitializedDb.executeQuery('SELECT 1')).rejects.toThrow(
      DatabaseError,
    );

    await expect(uninitializedDb.executeNonQuery('SELECT 1')).rejects.toThrow(
      DatabaseError,
    );
  });

  test('should close database successfully', async () => {
    await expect(db.close()).resolves.toBeUndefined();
    expect(db.initialized).toBe(false);
  });

  test('should use custom schema', async () => {
    const customSchema: DatabaseSchema = {
      tables: [
        `CREATE TABLE IF NOT EXISTS custom_table (
          id INTEGER PRIMARY KEY,
          data TEXT
        )`,
      ],
      indexes: [],
    };

    const customDb = await _createOPFSSQLiteDatabase(
      `custom-${Date.now()}`,
      customSchema,
    );

    try {
      await customDb.initialize();

      // Verify custom table exists
      const tables = await customDb.executeQuery<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='custom_table'",
      );
      expect(tables).toHaveLength(1);

      // Test operations on custom table
      await customDb.executeNonQuery(
        'INSERT INTO custom_table (data) VALUES (?)',
        ['test data'],
      );

      const results = await customDb.executeQuery<{ id: number; data: string }>(
        'SELECT * FROM custom_table',
      );
      expect(results).toHaveLength(1);
      expect(results[0].data).toBe('test data');
    } finally {
      await customDb.close();
    }
  });
});
