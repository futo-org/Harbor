import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KEY_TYPE, PolycentricClient } from '@polycentric/js-core';
import { ContentType, Event, ImageManifest } from '@polycentric/js-core';
import type { PolycentricClientConfig } from '@polycentric/js-core';
import {
  NodeWasmBridge,
  SqlStorageDriver,
  NodeCryptoManager,
} from '@lib-polycentric/node';
import { deleteDatabase, TEST_DB_DIR } from './utils';

describe('PolycentricClient LWW Elements', () => {
  const TEST_DB_NAME = 'test-db-lww';
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

  it('should create a username LWW element event', async () => {
    const username = 'testuser123';
    const signedEvent = await client.createUsername(username);

    expect(signedEvent).toBeDefined();
    expect(signedEvent.event).toBeDefined();

    const event = Event.fromBinary(signedEvent.event);
    expect(event.contentType).toBe(ContentType.USERNAME);
    expect(event.lwwElement).toBeDefined();
    expect(event.lwwElement?.value).toBeDefined();

    const decodedUsername = new TextDecoder().decode(event.lwwElement!.value);
    expect(decodedUsername).toBe(username);
  });

  it('should create a description LWW element event', async () => {
    const description = 'This is a test description for the user profile';
    const signedEvent = await client.createDescription(description);

    expect(signedEvent).toBeDefined();
    expect(signedEvent.event).toBeDefined();

    const event = Event.fromBinary(signedEvent.event);
    expect(event.contentType).toBe(ContentType.DESCRIPTION);
    expect(event.lwwElement).toBeDefined();
    expect(event.lwwElement?.value).toBeDefined();

    const decodedDescription = new TextDecoder().decode(
      event.lwwElement!.value,
    );
    expect(decodedDescription).toBe(description);
  });

  it('should create an avatar LWW element event', async () => {
    const avatar = ImageManifest.create({
      mime: 'image/png',
      width: 256,
      height: 256,
      digest: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    });

    const signedEvent = await client.createAvatar(avatar);

    expect(signedEvent).toBeDefined();
    expect(signedEvent.event).toBeDefined();

    const event = Event.fromBinary(signedEvent.event);
    expect(event.contentType).toBe(ContentType.AVATAR);
    expect(event.lwwElement).toBeDefined();
    expect(event.lwwElement?.value).toBeDefined();

    const decodedAvatar = ImageManifest.fromBinary(event.lwwElement!.value);
    expect(decodedAvatar.mime).toBe(avatar.mime);
    expect(decodedAvatar.width).toBe(avatar.width);
    expect(decodedAvatar.height).toBe(avatar.height);
  });

  it('should create a banner LWW element event', async () => {
    const banner = ImageManifest.create({
      mime: 'image/jpeg',
      width: 1200,
      height: 300,
      digest: new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16]),
    });

    const signedEvent = await client.createBanner(banner);

    expect(signedEvent).toBeDefined();
    expect(signedEvent.event).toBeDefined();

    const event = Event.fromBinary(signedEvent.event);
    expect(event.contentType).toBe(ContentType.BANNER);
    expect(event.lwwElement).toBeDefined();
    expect(event.lwwElement?.value).toBeDefined();

    const decodedBanner = ImageManifest.fromBinary(event.lwwElement!.value);
    expect(decodedBanner.mime).toBe(banner.mime);
    expect(decodedBanner.width).toBe(banner.width);
    expect(decodedBanner.height).toBe(banner.height);
  });

  it('should handle multiple descriptions with LWW semantics', async () => {
    const description1 = 'First description';
    const description2 = 'Second description';
    const description3 = 'Third description';

    await client.createDescription(description1);
    await client.createDescription(description2);
    await client.createDescription(description3);

    const currentDescription = await client.queryDescription(
      client.currentIdentity.keyPair.publicKey,
    );

    expect(currentDescription).toBeDefined();
    expect(currentDescription).toBe(description3);

    const description4 = 'Fourth description';
    await client.createDescription(description4);

    const updatedDescription = await client.queryDescription(
      client.currentIdentity.keyPair.publicKey,
    );
    expect(updatedDescription).toBe(description4);
  });

  it('should handle system-specific LWW elements across different identities', async () => {
    const firstIdentity = await client.createIdentity({
      keyType: KEY_TYPE.ED25519,
      setAsCurrent: true,
    });
    const firstUsername = 'first_user';
    await client.createUsername(firstUsername);

    const firstIdentityUsername = await client.queryUsername(
      firstIdentity.publicKey,
    );
    expect(firstIdentityUsername).toBe(firstUsername);

    const secondIdentity = await client.createIdentity({
      keyType: KEY_TYPE.ED25519,
      setAsCurrent: false,
    });

    await client.switchIdentity(secondIdentity.publicKey);

    const secondIdentityUsername = await client.queryUsername(
      secondIdentity.publicKey,
    );
    expect(secondIdentityUsername).toBeNull();

    const secondUsername = 'second_user';
    await client.createUsername(secondUsername);

    const updatedSecondIdentityUsername = await client.queryUsername(
      secondIdentity.publicKey,
    );
    expect(updatedSecondIdentityUsername).toBe(secondUsername);

    const thirdUsername = 'third_user';
    await client.createUsername(thirdUsername);

    const finalSecondIdentityUsername = await client.queryUsername(
      secondIdentity.publicKey,
    );
    expect(finalSecondIdentityUsername).toBe(thirdUsername);

    await client.switchIdentity(firstIdentity.publicKey);
    const finalFirstIdentityUsername = await client.queryUsername(
      firstIdentity.publicKey,
    );
    expect(finalFirstIdentityUsername).toBe(firstUsername);
  });
});
