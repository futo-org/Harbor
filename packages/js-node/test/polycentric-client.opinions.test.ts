import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KEY_TYPE, PolycentricClient } from '@polycentric/js-core';
import { Event, Opinion, Pointer } from '@polycentric/js-core';
import type { PolycentricClientConfig } from '@polycentric/js-core';
import {
  NodeWasmBridge,
  NodeCryptoManager,
  SqlStorageDriver,
} from '@lib-polycentric/node';
import { deleteDatabase, TEST_DB_DIR } from './utils';

describe('PolycentricClient Opinions', () => {
  const TEST_DB_NAME = 'test-db-opinions';
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

  it('should create a post and like it', async () => {
    const postContent = 'Test post for opinion testing';
    const signedEvent = await client.createPost(postContent);
    expect(signedEvent).toBeDefined();
    expect(signedEvent.event).toBeDefined();

    const event = Event.fromBinary(signedEvent.event);
    const postPointer = Pointer.create({
      system: event.system,
      process: event.process,
      logicalClock: event.logicalClock,
      eventDigest: {
        digestType: 0n,
        digest: signedEvent.signature,
      },
    });

    const likeEvent = await client.createLike(postPointer);
    expect(likeEvent).toBeDefined();

    const currentOpinion = await client.queryCurrentOpinion(postPointer);
    expect(currentOpinion).toBeDefined();
    expect(currentOpinion?.value).toBeDefined();
    expect(currentOpinion?.value.length).toBe(1);
    expect(currentOpinion?.value[0]).toBe(Opinion.LIKE);
  });

  it('should create a post and dislike it', async () => {
    const postContent = 'Test post for dislike testing';
    const signedEvent = await client.createPost(postContent);
    expect(signedEvent).toBeDefined();

    const event = Event.fromBinary(signedEvent.event);
    const postPointer = Pointer.create({
      system: event.system,
      process: event.process,
      logicalClock: event.logicalClock,
      eventDigest: {
        digestType: 0n,
        digest: signedEvent.signature,
      },
    });

    const dislikeEvent = await client.createDislike(postPointer);
    expect(dislikeEvent).toBeDefined();

    const currentOpinion = await client.queryCurrentOpinion(postPointer);
    expect(currentOpinion).toBeDefined();
    expect(currentOpinion?.value[0]).toBe(Opinion.DISLIKE);
  });

  it('should create a post and set neutral opinion', async () => {
    const postContent = 'Test post for neutral testing';
    const signedEvent = await client.createPost(postContent);
    expect(signedEvent).toBeDefined();

    const event = Event.fromBinary(signedEvent.event);
    const postPointer = Pointer.create({
      system: event.system,
      process: event.process,
      logicalClock: event.logicalClock,
      eventDigest: {
        digestType: 0n,
        digest: signedEvent.signature,
      },
    });

    const neutralEvent = await client.createNeutral(postPointer);
    expect(neutralEvent).toBeDefined();

    const currentOpinion = await client.queryCurrentOpinion(postPointer);
    expect(currentOpinion).toBeDefined();
    expect(currentOpinion?.value[0]).toBe(Opinion.NEUTRAL);
  });

  it('should handle multiple opinions on the same post with LWW semantics', async () => {
    const postContent = 'Test post for multiple opinions';
    const signedEvent = await client.createPost(postContent);
    expect(signedEvent).toBeDefined();

    const event = Event.fromBinary(signedEvent.event);
    const postPointer = Pointer.create({
      system: event.system,
      process: event.process,
      logicalClock: event.logicalClock,
      eventDigest: {
        digestType: 0n,
        digest: signedEvent.signature,
      },
    });

    await client.createLike(postPointer);
    await client.createDislike(postPointer);
    await client.createNeutral(postPointer);

    const currentOpinion = await client.queryCurrentOpinion(postPointer);
    expect(currentOpinion).toBeDefined();
    expect(currentOpinion?.value[0]).toBe(Opinion.NEUTRAL);

    await client.createLike(postPointer);

    const updatedOpinion = await client.queryCurrentOpinion(postPointer);
    expect(updatedOpinion).toBeDefined();
    expect(updatedOpinion?.value[0]).toBe(Opinion.LIKE);
  });

  it('should return null when querying opinion for post with no opinions', async () => {
    const postContent = 'Test post with no opinions';
    const signedEvent = await client.createPost(postContent);
    expect(signedEvent).toBeDefined();

    const event = Event.fromBinary(signedEvent.event);
    const postPointer = Pointer.create({
      system: event.system,
      process: event.process,
      logicalClock: event.logicalClock,
      eventDigest: {
        digestType: 0n,
        digest: signedEvent.signature,
      },
    });

    const currentOpinion = await client.queryCurrentOpinion(postPointer);
    expect(currentOpinion).toBeNull();
  });

  it('should handle opinions across different identities', async () => {
    const postContent = 'Test post for cross-identity opinion testing';
    const signedEvent = await client.createPost(postContent);
    expect(signedEvent).toBeDefined();

    const event = Event.fromBinary(signedEvent.event);
    const postPointer = Pointer.create({
      system: event.system,
      process: event.process,
      logicalClock: event.logicalClock,
      eventDigest: {
        digestType: 0n,
        digest: signedEvent.signature,
      },
    });

    const firstIdentityPublicKey = client.currentIdentity.keyPair.publicKey;

    const secondIdentity = await client.createIdentity({
      keyType: KEY_TYPE.ED25519,
      setAsCurrent: false,
    });

    await client.switchIdentity(secondIdentity.publicKey);

    const likeEvent = await client.createLike(postPointer);
    expect(likeEvent).toBeDefined();

    const currentOpinion = await client.queryCurrentOpinion(postPointer);
    expect(currentOpinion).toBeDefined();
    expect(currentOpinion?.value).toBeDefined();
    expect(currentOpinion?.value.length).toBe(1);
    expect(currentOpinion?.value[0]).toBe(Opinion.LIKE);

    await client.switchIdentity(firstIdentityPublicKey);

    const firstIdentityOpinion = await client.queryCurrentOpinion(postPointer);

    expect(firstIdentityOpinion).toBeNull();
  });
});
