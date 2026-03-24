import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _createIndexedDBDatabase,
  IndexedDBDatabase,
  IndexedDBStorageDriver,
} from '@polycentric/js-browser/full';
import { DatabaseError } from '@polycentric/js-core';

const testLayout = {
  version: 1,
  stores: [
    {
      name: 'test_items',
      options: {
        keyPath: 'id',
      },
      indexes: [
        {
          name: 'name_index',
          keyPath: 'name',
        },
      ],
    },
  ],
};

interface TestItem {
  id: string;
  name: string;
  value: number;
}

describe('IndexedDBDatabase', () => {
  let db: IndexedDBDatabase;
  const dbName = `test-db-${Date.now()}`;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db = await _createIndexedDBDatabase(dbName, testLayout);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await IndexedDBDatabase.deleteDatabase(dbName);
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should throw error for empty database name', async () => {
    await expect(
      async () => await _createIndexedDBDatabase('', testLayout),
    ).rejects.toThrow(DatabaseError);
    await expect(
      async () => await _createIndexedDBDatabase('   ', testLayout),
    ).rejects.toThrow(DatabaseError);
  });

  test('should initialize successfully', async () => {
    expect(db).toBeDefined();
    expect(db.initialized).toBe(true);
  });

  test('should create schema stores and indexes', async () => {
    const transaction = db.createTransaction('test_items', 'readonly');
    const store = transaction.objectStore('test_items');
    expect(store).toBeDefined();

    const index = store.index('name_index');
    expect(index).toBeDefined();
  });

  test('should insert and retrieve data', async () => {
    const testItem: TestItem = {
      id: 'item1',
      name: 'Test Item',
      value: 42,
    };

    const writeTransaction = db.createTransaction('test_items', 'readwrite');
    const writeStore = writeTransaction.objectStore('test_items');
    await IndexedDBDatabase.requestAsPromise(writeStore.put(testItem));
    writeTransaction.commit();

    const readTransaction = db.createTransaction('test_items', 'readonly');
    const readStore = readTransaction.objectStore('test_items');
    const result = await IndexedDBDatabase.requestAsPromise<TestItem>(
      readStore.get('item1'),
    );

    expect(result).toBeDefined();
    expect(result).toEqual(testItem);
  });

  test('should update existing data', async () => {
    const originalItem: TestItem = {
      id: 'item2',
      name: 'Original',
      value: 10,
    };

    const updatedItem: TestItem = {
      id: 'item2',
      name: 'Updated',
      value: 20,
    };

    const writeTransaction = db.createTransaction('test_items', 'readwrite');
    const writeStore = writeTransaction.objectStore('test_items');
    await IndexedDBDatabase.requestAsPromise(writeStore.put(originalItem));
    writeTransaction.commit();

    const updateTransaction = db.createTransaction('test_items', 'readwrite');
    const updateStore = updateTransaction.objectStore('test_items');
    await IndexedDBDatabase.requestAsPromise(updateStore.put(updatedItem));
    updateTransaction.commit();

    const readTransaction = db.createTransaction('test_items', 'readonly');
    const readStore = readTransaction.objectStore('test_items');
    const result = await IndexedDBDatabase.requestAsPromise<TestItem>(
      readStore.get('item2'),
    );

    expect(result).toEqual(updatedItem);
  });

  test('should delete data', async () => {
    const testItem: TestItem = {
      id: 'item3',
      name: 'To Delete',
      value: 5,
    };

    const writeTransaction = db.createTransaction('test_items', 'readwrite');
    const writeStore = writeTransaction.objectStore('test_items');
    await IndexedDBDatabase.requestAsPromise(writeStore.put(testItem));
    writeTransaction.commit();

    const deleteTransaction = db.createTransaction('test_items', 'readwrite');
    const deleteStore = deleteTransaction.objectStore('test_items');
    await IndexedDBDatabase.requestAsPromise(deleteStore.delete('item3'));
    deleteTransaction.commit();

    const readTransaction = db.createTransaction('test_items', 'readonly');
    const readStore = readTransaction.objectStore('test_items');
    const result = await IndexedDBDatabase.requestAsPromise<TestItem>(
      readStore.get('item3'),
    );
    expect(result).toBeUndefined();
  });

  test('should return undefined for non-existent data', async () => {
    const readTransaction = db.createTransaction('test_items', 'readonly');
    const readStore = readTransaction.objectStore('test_items');
    const result = await IndexedDBDatabase.requestAsPromise<TestItem>(
      readStore.get('nonexistent'),
    );
    expect(result).toBeUndefined();
  });

  test('should throw DatabaseError when operating on uninitialized database', async () => {
    const uninitializedDb = new IndexedDBDatabase('uninitialized', testLayout);

    await expect(() => uninitializedDb.createTransaction('test_items')).toThrow(
      DatabaseError,
    );
  });

  test('should close database successfully', async () => {
    expect(() => db.close()).not.toThrow();
    expect(db.initialized).toBe(false);
  });

  test('should use custom layout', async () => {
    const customLayout = {
      version: 2,
      stores: [
        {
          name: 'custom_table',
          options: {
            keyPath: 'id',
          },
          indexes: [],
        },
      ],
    };

    const customDbName = `custom-${Date.now()}`;
    const customDb = await _createIndexedDBDatabase(customDbName, customLayout);

    try {
      const transaction = customDb.createTransaction(
        'custom_table',
        'readonly',
      );
      const store = transaction.objectStore('custom_table');
      expect(store).toBeDefined();

      const testData = { id: 1, data: 'test data' };
      const writeTransaction = customDb.createTransaction(
        'custom_table',
        'readwrite',
      );
      const writeStore = writeTransaction.objectStore('custom_table');
      await IndexedDBDatabase.requestAsPromise(writeStore.put(testData));
      writeTransaction.commit();

      const readTransaction = customDb.createTransaction(
        'custom_table',
        'readonly',
      );
      const readStore = readTransaction.objectStore('custom_table');
      const result = await IndexedDBDatabase.requestAsPromise(readStore.get(1));
      expect(result).toEqual(testData);
    } finally {
      await IndexedDBDatabase.deleteDatabase(customDbName);
    }
  });

  test('should handle index queries', async () => {
    const items: TestItem[] = [
      { id: 'item1', name: 'Apple', value: 1 },
      { id: 'item2', name: 'Banana', value: 2 },
      { id: 'item3', name: 'Apple', value: 3 },
    ];

    const writeTransaction = db.createTransaction('test_items', 'readwrite');
    const writeStore = writeTransaction.objectStore('test_items');
    for (const item of items) {
      await IndexedDBDatabase.requestAsPromise(writeStore.put(item));
    }
    writeTransaction.commit();

    const readTransaction = db.createTransaction('test_items', 'readonly');
    const readStore = readTransaction.objectStore('test_items');
    const nameIndex = readStore.index('name_index');

    const appleResults = await IndexedDBDatabase.requestAsPromise<TestItem[]>(
      nameIndex.getAll('Apple'),
    );
    expect(appleResults).toHaveLength(2);
    expect(appleResults.every((item) => item.name === 'Apple')).toBe(true);
  });
});

describe('IndexedDBStorageDriver', () => {
  test('should be able to create a new storage driver', async () => {
    const driver = await IndexedDBStorageDriver.create('test-db');
    expect(driver).toBeDefined();
  });
});
