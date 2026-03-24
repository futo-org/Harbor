import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KEY_TYPE, PolycentricClient } from '@polycentric/js-core';
import type { PolycentricClientConfig } from '@polycentric/js-core';
import {
  NodeWasmBridge,
  NodeCryptoManager,
  SqlStorageDriver,
} from '@lib-polycentric/node';
import { deleteDatabase, TEST_DB_DIR } from './utils';

describe('PolycentricClient Queries', () => {
  const TEST_DB_NAME = 'test-db-queries';
  let client: PolycentricClient;

  beforeAll(async () => {
    try {
      await deleteDatabase(TEST_DB_NAME);
    } catch {
      // ignore cleanup errors
    }

    const clientConfig: PolycentricClientConfig = {
      coreBridge: new NodeWasmBridge(),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME, TEST_DB_DIR),
      cryptoManager: new NodeCryptoManager(),
    };

    client = await PolycentricClient.create(clientConfig);
    await client.createIdentity({ keyType: KEY_TYPE.ED25519 });
  });

  afterAll(async () => {
    try {
      await deleteDatabase(TEST_DB_NAME);
    } catch {
      // ignore cleanup errors
    }
  });

  describe('FeedQuery with cursor support', () => {
    it('should return empty result when no events exist', () => {
      const emptySystem = {
        keyType: BigInt(999),
        key: new Uint8Array([1, 2, 3, 4, 5]),
      };

      const feedResult = client.queryFeed(emptySystem, {
        limit: 10,
      });

      expect(feedResult.events).toBeDefined();
      expect(feedResult.events.length).toBe(0);
      expect(feedResult.cursor).toBeDefined();
      expect(feedResult.cursor.length).toBe(0);
    });

    it('should query feed events with pagination', async () => {
      await client.createPost('First post for feed testing');
      await client.createPost('Second post for feed testing');
      await client.createPost('Third post for feed testing');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const feedResult1 = client.queryFeed(
        client.currentIdentity.keyPair.publicKey,
        {
          limit: 2,
        },
      );

      expect(feedResult1.events).toBeDefined();
      expect(feedResult1.cursor).toBeDefined();
      expect(feedResult1.events.length).toBeLessThanOrEqual(2);

      if (feedResult1.cursor.length > 0) {
        const feedResult2 = client.queryFeed(
          client.currentIdentity.keyPair.publicKey,
          {
            limit: 2,
            cursor: feedResult1.cursor,
          },
        );

        expect(feedResult2.events).toBeDefined();
        expect(feedResult2.cursor).toBeDefined();
        expect(feedResult2.events.length).toBeLessThanOrEqual(2);
      }
    });

    it('should query feed events with time range', async () => {
      const now = BigInt(Date.now());

      const feedResult = client.queryFeed(
        client.currentIdentity.keyPair.publicKey,
        {
          startTime: now - BigInt(60000), // Last minute
          endTime: now,
          limit: 10,
        },
      );

      expect(feedResult.events).toBeDefined();
      expect(feedResult.cursor).toBeDefined();
    });

    it('should handle cursor pagination correctly', async () => {
      for (let i = 0; i < 5; i++) {
        await client.createPost(`Post ${i + 1} for pagination test`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const page1 = client.queryFeed(client.currentIdentity.keyPair.publicKey, {
        limit: 2,
      });

      expect(page1.events.length).toBe(2);
      expect(page1.cursor.length).toBeGreaterThan(0);

      const page2 = client.queryFeed(client.currentIdentity.keyPair.publicKey, {
        limit: 2,
        cursor: page1.cursor,
      });

      expect(page2.events.length).toBe(2);
      expect(page2.cursor.length).toBeGreaterThan(0);

      const page3 = client.queryFeed(client.currentIdentity.keyPair.publicKey, {
        limit: 2,
        cursor: page2.cursor,
      });

      expect(page3.events.length).toBeGreaterThan(0);
    });
  });
});
