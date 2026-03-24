import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KEY_TYPE, PolycentricClient } from '@polycentric/js-core';
import type { PolycentricClientConfig } from '@polycentric/js-core';
import wasmUrl from '@polycentric/rs-core-wasm-browser/polycentric_core_bg.wasm';
import {
  BrowserWasmBridge,
  SqlStorageDriver,
  BrowserCryptoManager,
  OPFSSQLiteDatabase,
} from '@polycentric/js-browser/full';

describe('PolycentricClient LWW Element Sets', () => {
  const TEST_DB_NAME = 'test-db-lww-set';
  let client: PolycentricClient;

  beforeAll(async () => {
    try {
      await OPFSSQLiteDatabase.deleteDatabase(TEST_DB_NAME);
    } catch {
      // ignore cleanup errors
    }

    const clientConfig: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME),
      cryptoManager: new BrowserCryptoManager(),
    };

    client = await PolycentricClient.create(clientConfig);
    await client.createIdentity({ keyType: KEY_TYPE.ED25519 });
  });

  afterAll(async () => {
    try {
      await OPFSSQLiteDatabase.deleteDatabase(TEST_DB_NAME);
    } catch {
      // ignore cleanup errors
    }
  });

  describe('Follow Set', () => {
    it('should add and remove follows correctly', async () => {
      const system1 = await client.createIdentity({
        keyType: KEY_TYPE.ED25519,
        setAsCurrent: false,
      });
      const system2 = await client.createIdentity({
        keyType: KEY_TYPE.ED25519,
        setAsCurrent: false,
      });
      const system3 = await client.createIdentity({
        keyType: KEY_TYPE.ED25519,
        setAsCurrent: false,
      });

      await client.switchIdentity(client.currentIdentity.keyPair.publicKey);

      let follows = client.queryFollows(
        client.currentIdentity.keyPair.publicKey,
      );
      expect(follows).toEqual([]);

      await client.createFollow(system1.publicKey);
      await client.createFollow(system2.publicKey);
      await client.createFollow(system3.publicKey);

      follows = client.queryFollows(client.currentIdentity.keyPair.publicKey);
      expect(follows).toHaveLength(3);
      expect(follows.map((f) => f.key)).toEqual(
        expect.arrayContaining([
          system1.publicKey.key,
          system2.publicKey.key,
          system3.publicKey.key,
        ]),
      );

      await client.createUnfollow(system2.publicKey);

      follows = client.queryFollows(client.currentIdentity.keyPair.publicKey);
      expect(follows).toHaveLength(2);
      expect(follows.map((f) => f.key)).toEqual(
        expect.arrayContaining([system1.publicKey.key, system3.publicKey.key]),
      );
      expect(follows.map((f) => f.key)).not.toContain(system2.publicKey.key);
    });
  });

  describe('Block Set', () => {
    it('should add and remove blocks correctly', async () => {
      const system1 = await client.createIdentity({
        keyType: KEY_TYPE.ED25519,
        setAsCurrent: false,
      });
      const system2 = await client.createIdentity({
        keyType: KEY_TYPE.ED25519,
        setAsCurrent: false,
      });

      await client.switchIdentity(client.currentIdentity.keyPair.publicKey);

      let blocks = client.queryBlocks(client.currentIdentity.keyPair.publicKey);
      expect(blocks).toEqual([]);

      await client.createBlock(system1.publicKey);
      await client.createBlock(system2.publicKey);

      blocks = client.queryBlocks(client.currentIdentity.keyPair.publicKey);
      expect(blocks).toHaveLength(2);
      expect(blocks.map((b) => b.key)).toEqual(
        expect.arrayContaining([system1.publicKey.key, system2.publicKey.key]),
      );

      await client.createUnblock(system1.publicKey);

      blocks = client.queryBlocks(client.currentIdentity.keyPair.publicKey);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].key).toEqual(system2.publicKey.key);
      expect(blocks.map((b) => b.key)).not.toContain(system1.publicKey.key);
    });
  });

  describe('Server Set', () => {
    it('should add and remove servers correctly', async () => {
      let servers = client.queryServers(
        client.currentIdentity.keyPair.publicKey,
      );
      expect(servers).toEqual([]);

      await client.createAddServer('https://server1.example.com');
      await client.createAddServer('https://server2.example.com');
      await client.createAddServer('https://server3.example.com');

      servers = client.queryServers(client.currentIdentity.keyPair.publicKey);
      expect(servers).toHaveLength(3);
      expect(servers).toEqual(
        expect.arrayContaining([
          'https://server1.example.com',
          'https://server2.example.com',
          'https://server3.example.com',
        ]),
      );

      await client.createRemoveServer('https://server2.example.com');

      servers = client.queryServers(client.currentIdentity.keyPair.publicKey);
      expect(servers).toHaveLength(2);
      expect(servers).toEqual(
        expect.arrayContaining([
          'https://server1.example.com',
          'https://server3.example.com',
        ]),
      );
      expect(servers).not.toContain('https://server2.example.com');
    });
  });

  describe('Authority Set', () => {
    it('should add and remove authorities correctly', async () => {
      let authorities = client.queryAuthorities(
        client.currentIdentity.keyPair.publicKey,
      );
      expect(authorities).toEqual([]);

      await client.createAddAuthority('https://auth1.example.com');
      await client.createAddAuthority('https://auth2.example.com');

      authorities = client.queryAuthorities(
        client.currentIdentity.keyPair.publicKey,
      );
      expect(authorities).toHaveLength(2);
      expect(authorities).toEqual(
        expect.arrayContaining([
          'https://auth1.example.com',
          'https://auth2.example.com',
        ]),
      );

      await client.createRemoveAuthority('https://auth1.example.com');

      authorities = client.queryAuthorities(
        client.currentIdentity.keyPair.publicKey,
      );
      expect(authorities).toHaveLength(1);
      expect(authorities[0]).toBe('https://auth2.example.com');
      expect(authorities).not.toContain('https://auth1.example.com');
    });
  });

  describe('Topic Set', () => {
    it('should add and remove topics correctly', async () => {
      let topics = client.queryTopics(client.currentIdentity.keyPair.publicKey);
      expect(topics).toEqual([]);

      await client.createJoinTopic('technology');
      await client.createJoinTopic('science');
      await client.createJoinTopic('politics');

      topics = client.queryTopics(client.currentIdentity.keyPair.publicKey);
      expect(topics).toHaveLength(3);
      expect(topics).toEqual(
        expect.arrayContaining(['technology', 'science', 'politics']),
      );

      await client.createLeaveTopic('science');

      topics = client.queryTopics(client.currentIdentity.keyPair.publicKey);
      expect(topics).toHaveLength(2);
      expect(topics).toEqual(
        expect.arrayContaining(['technology', 'politics']),
      );
      expect(topics).not.toContain('science');
    });
  });

  describe('Cross-System Isolation', () => {
    it('should maintain separate sets for different systems', async () => {
      const identity1 = await client.createIdentity({
        keyType: KEY_TYPE.ED25519,
        setAsCurrent: true,
      });
      const identity2 = await client.createIdentity({
        keyType: KEY_TYPE.ED25519,
        setAsCurrent: false,
      });

      await client.switchIdentity(identity1.publicKey);

      await client.createAddServer('https://identity1-server.com');
      await client.createJoinTopic('identity1-topic');

      let servers = client.queryServers(identity1.publicKey);
      let topics = client.queryTopics(identity1.publicKey);
      expect(servers).toEqual(['https://identity1-server.com']);
      expect(topics).toEqual(['identity1-topic']);

      await client.switchIdentity(identity2.publicKey);

      servers = client.queryServers(identity2.publicKey);
      topics = client.queryTopics(identity2.publicKey);
      expect(servers).toEqual([]);
      expect(topics).toEqual([]);

      await client.createAddServer('https://identity2-server.com');
      await client.createJoinTopic('identity2-topic');

      servers = client.queryServers(identity2.publicKey);
      topics = client.queryTopics(identity2.publicKey);
      expect(servers).toEqual(['https://identity2-server.com']);
      expect(topics).toEqual(['identity2-topic']);

      await client.switchIdentity(identity1.publicKey);

      servers = client.queryServers(identity1.publicKey);
      topics = client.queryTopics(identity1.publicKey);
      expect(servers).toEqual(['https://identity1-server.com']);
      expect(topics).toEqual(['identity1-topic']);

      expect(servers).not.toContain('https://identity2-server.com');
      expect(topics).not.toContain('identity2-topic');
    });
  });

  describe('LWW Semantics', () => {
    it('should handle LWW semantics correctly for add/remove operations', async () => {
      const testServer = 'https://lww-test.example.com';

      await client.createAddServer(testServer);

      let servers = client.queryServers(
        client.currentIdentity.keyPair.publicKey,
      );
      expect(servers).toContain(testServer);

      await client.createRemoveServer(testServer);

      servers = client.queryServers(client.currentIdentity.keyPair.publicKey);
      expect(servers).not.toContain(testServer);

      await client.createAddServer(testServer);

      servers = client.queryServers(client.currentIdentity.keyPair.publicKey);
      expect(servers).toContain(testServer);
    });
  });
});
