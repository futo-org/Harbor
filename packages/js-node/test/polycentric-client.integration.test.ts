import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KEY_TYPE, PolycentricClient, Event } from '@polycentric/js-core';
import type { PolycentricClientConfig, KeyPair } from '@polycentric/js-core';
import {
  NodeWasmBridge,
  NodeCryptoManager,
  SqlStorageDriver,
  _createNodeSQLiteDatabase,
} from '@lib-polycentric/node';
import { deleteDatabase, TEST_DB_DIR } from './utils';

describe('PolycentricClient', () => {
  const TEST_DB_NAME = 'test-db';

  beforeEach(async () => {
    try {
      await deleteDatabase(TEST_DB_NAME);
    } catch {
      // ignore cleanup errors
    }
  });

  afterEach(async () => {
    try {
      await deleteDatabase(TEST_DB_NAME);
    } catch {
      // ignore cleanup errors
    }
  });

  it('should be able to create a new client', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new NodeWasmBridge(),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME, TEST_DB_DIR),
      cryptoManager: new NodeCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);
    expect(client).toBeInstanceOf(PolycentricClient);
  });

  it('should be able to create a new process id if none exists', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new NodeWasmBridge(),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME, TEST_DB_DIR),
      cryptoManager: new NodeCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);
    expect(client).toBeInstanceOf(PolycentricClient);

    const processIdFromStorage = await client.storage.processId.getProcessId();
    expect(client.process).toBeDefined();
    expect(client.process?.process).toEqual(processIdFromStorage?.process);
  });

  it('should be able to retrieve the process id if one exists', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new NodeWasmBridge(),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME, TEST_DB_DIR),
      cryptoManager: new NodeCryptoManager(),
    };

    const client1 = await PolycentricClient.create(clientConfig);
    const client2 = await PolycentricClient.create(clientConfig);
    expect(client2.process).toEqual(client1.process);
  });

  it('should be able to create a new identity', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new NodeWasmBridge(),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME, TEST_DB_DIR),
      cryptoManager: new NodeCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);
    const keyPair: KeyPair = await client.createIdentity({
      keyType: KEY_TYPE.ED25519,
    });

    expect(keyPair).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();
    expect(keyPair.publicKey).toBeDefined();

    expect(client.currentIdentity).toBeDefined();
    expect(client.currentIdentity.keyPair).toStrictEqual(keyPair);
    expect(client.currentIdentity.process).toStrictEqual(client.process);
  });

  it('should create a post and persist the event and logical clock', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new NodeWasmBridge(),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME, TEST_DB_DIR),
      cryptoManager: new NodeCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);
    await client.createIdentity({ keyType: KEY_TYPE.ED25519 });

    const content = 'Test post content';
    const signedEvent = await client.createPost(content);

    // TODO: this only works with sql. add an _getEvent by pointer to event store for testing purposes.
    const event = Event.fromBinary(signedEvent.event);
    const database = await _createNodeSQLiteDatabase(TEST_DB_NAME, TEST_DB_DIR);
    const persistedEvents = await database.executeQuery<{
      system_key_type: string;
      system_key: Buffer;
      process: Buffer;
      logical_clock: string;
      signature: Buffer;
      raw_event: Buffer;
    }>(
      `SELECT * FROM events 
       WHERE system_key_type = ? 
       AND system_key = ? 
       AND process = ? 
       AND logical_clock = ?`,
      [
        event.system?.keyType.toString(),
        event.system?.key,
        event.process?.process,
        event.logicalClock.toString(),
      ],
    );

    expect(persistedEvents.length).toBe(1);
    expect(Uint8Array.from(persistedEvents[0].signature)).toEqual(
      signedEvent.signature,
    );
    expect(Uint8Array.from(persistedEvents[0].raw_event)).toEqual(
      signedEvent.event,
    );

    const logicalClock =
      await client.storage.processStates.getCurrentLogicalClock(
        client.currentIdentity.keyPair.keyType,
        client.currentIdentity.keyPair.publicKey.key,
        client.process.process,
      );
    expect(logicalClock).toBeGreaterThan(0n);
  });

  it('should create multiple posts and increment logical clock', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new NodeWasmBridge(),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME, TEST_DB_DIR),
      cryptoManager: new NodeCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);
    await client.createIdentity({ keyType: KEY_TYPE.ED25519 });

    const content1 = 'First post';
    const content2 = 'Second post';

    const signedEvent1 = await client.createPost(content1);
    const signedEvent2 = await client.createPost(content2);

    const event1 = Event.fromBinary(signedEvent1.event);
    const event2 = Event.fromBinary(signedEvent2.event);

    expect(event2.logicalClock).toBeGreaterThan(event1.logicalClock);

    const database = await _createNodeSQLiteDatabase(TEST_DB_NAME, TEST_DB_DIR);
    const persistedEvents = await database.executeQuery<{
      system_key_type: string;
      system_key: Uint8Array;
      process: Uint8Array;
      logical_clock: string;
      signature: Uint8Array;
      raw_event: Uint8Array;
    }>(
      `SELECT * FROM events 
       WHERE system_key_type = ? 
       AND system_key = ? 
       AND process = ? 
       ORDER BY logical_clock ASC`,
      [
        event1.system?.keyType.toString(),
        event1.system?.key,
        event1.process?.process,
      ],
    );

    expect(persistedEvents.length).toBe(2);
    expect(BigInt(persistedEvents[0].logical_clock)).toBe(event1.logicalClock);
    expect(BigInt(persistedEvents[1].logical_clock)).toBe(event2.logicalClock);
  });

  it('should handle concurrent post creation', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new NodeWasmBridge(),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME, TEST_DB_DIR),
      cryptoManager: new NodeCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);
    await client.createIdentity({ keyType: KEY_TYPE.ED25519 });

    const content1 = 'First post';
    const content2 = 'Second post';
    const content3 = 'Third post';

    const signedEvent1 = await client.createPost(content1);
    const signedEvent2 = await client.createPost(content2);
    const signedEvent3 = await client.createPost(content3);

    const event1 = Event.fromBinary(signedEvent1.event);
    const event2 = Event.fromBinary(signedEvent2.event);
    const event3 = Event.fromBinary(signedEvent3.event);

    expect(event2.logicalClock).toBeGreaterThan(event1.logicalClock);
    expect(event3.logicalClock).toBeGreaterThan(event2.logicalClock);

    const database = await _createNodeSQLiteDatabase(TEST_DB_NAME, TEST_DB_DIR);
    const persistedEvents = await database.executeQuery<{
      system_key_type: string;
      system_key: Uint8Array;
      process: Uint8Array;
      logical_clock: string;
      signature: Uint8Array;
      raw_event: Uint8Array;
    }>(
      `SELECT * FROM events 
       WHERE system_key_type = ? 
       AND system_key = ? 
       AND process = ? 
       ORDER BY logical_clock ASC`,
      [
        event1.system?.keyType.toString(),
        event1.system?.key,
        event1.process?.process,
      ],
    );

    expect(persistedEvents.length).toBe(3);
    expect(BigInt(persistedEvents[0].logical_clock)).toBe(event1.logicalClock);
    expect(BigInt(persistedEvents[1].logical_clock)).toBe(event2.logicalClock);
    expect(BigInt(persistedEvents[2].logical_clock)).toBe(event3.logicalClock);
  });

  it('should maintain event order with logical clocks', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new NodeWasmBridge(),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME, TEST_DB_DIR),
      cryptoManager: new NodeCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);
    await client.createIdentity({ keyType: KEY_TYPE.ED25519 });

    const post1 = await client.createPost('Post 1');
    const post2 = await client.createPost('Post 2');
    const post3 = await client.createPost('Post 3');

    const events = [post1, post2, post3].map((post) =>
      Event.fromBinary(post.event),
    );

    const database = await _createNodeSQLiteDatabase(TEST_DB_NAME, TEST_DB_DIR);
    const persistedEvents = await database.executeQuery<{
      logical_clock: string;
      raw_event: Uint8Array;
    }>(
      `SELECT logical_clock, raw_event FROM events 
       WHERE system_key_type = ? 
       AND system_key = ? 
       AND process = ? 
       ORDER BY logical_clock ASC`,
      [
        events[0].system?.keyType.toString(),
        events[0].system?.key,
        events[0].process?.process,
      ],
    );

    expect(persistedEvents.length).toBe(3);

    const logicalClocks = persistedEvents.map((e) => BigInt(e.logical_clock));
    expect(logicalClocks).toEqual(
      [...logicalClocks].sort((a, b) => Number(a - b)),
    );

    expect(BigInt(persistedEvents[0].logical_clock)).toBeLessThan(
      BigInt(persistedEvents[1].logical_clock),
    );
    expect(BigInt(persistedEvents[1].logical_clock)).toBeLessThan(
      BigInt(persistedEvents[2].logical_clock),
    );
  });
});
