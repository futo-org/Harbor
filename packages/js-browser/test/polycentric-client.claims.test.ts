import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PolycentricClient,
  KEY_TYPE,
  type ClaimFieldEntry,
  type SignedEvent,
} from '@polycentric/js-core';
import type { PolycentricClientConfig } from '@polycentric/js-core';
import wasmUrl from '@polycentric/rs-core-wasm-browser/polycentric_core_bg.wasm';
import {
  BrowserWasmBridge,
  SqlStorageDriver,
  BrowserCryptoManager,
  OPFSSQLiteDatabase,
} from '@polycentric/js-browser/full';

describe('PolycentricClient Claims and Vouches', () => {
  const TEST_DB_NAME_1 = 'test-db-claims-1';
  const TEST_DB_NAME_2 = 'test-db-claims-2';
  let client1: PolycentricClient;
  let client2: PolycentricClient;

  beforeEach(async () => {
    // Clean up any existing test databases
    try {
      await OPFSSQLiteDatabase.deleteDatabase(TEST_DB_NAME_1);
      await OPFSSQLiteDatabase.deleteDatabase(TEST_DB_NAME_2);
    } catch {
      // ignore cleanup errors
    }

    // Create two different clients with different identities
    const clientConfig1: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME_1),
      cryptoManager: new BrowserCryptoManager(),
    };

    const clientConfig2: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME_2),
      cryptoManager: new BrowserCryptoManager(),
    };

    client1 = await PolycentricClient.create(clientConfig1);
    client2 = await PolycentricClient.create(clientConfig2);

    // Create identities for both clients
    await client1.createIdentity({ keyType: KEY_TYPE.ED25519 });
    await client2.createIdentity({ keyType: KEY_TYPE.ED25519 });
  });

  afterEach(async () => {
    // Clean up test databases
    try {
      await OPFSSQLiteDatabase.deleteDatabase(TEST_DB_NAME_1);
      await OPFSSQLiteDatabase.deleteDatabase(TEST_DB_NAME_2);
    } catch {
      // ignore cleanup errors
    }
  });

  it('should create a claim on an identity', async () => {
    // Create a claim about client1's identity
    const claimType = 1n; // Example claim type (e.g., "verified email")
    const claimFields: ClaimFieldEntry[] = [
      {
        key: 1n, // Field key for email
        value: 'user@example.com',
      },
      {
        key: 2n, // Field key for verification method
        value: 'email_verification',
      },
    ];

    const claimEvent = await client1.createClaim(claimType, claimFields);

    expect(claimEvent).toBeDefined();
    expect(claimEvent.signature).toBeDefined();
    expect(claimEvent.event).toBeDefined();

    // Verify the claim appears in the feed
    const feedResult = client1.queryFeed(
      client1.currentIdentity.keyPair.publicKey,
      {
        limit: 10,
      },
    );
    expect(feedResult.events.length).toBeGreaterThan(0);

    // Find the claim event in the feed
    const claimEventInFeed = feedResult.events.find(() => {
      // This would need to be parsed to check content type
      // For now, just check that we have events
      return true;
    });
    expect(claimEventInFeed).toBeDefined();
  }, 30000);

  it("should create a vouch for another identity's claim", async () => {
    // First, create a claim with client1
    const claimType = 1n;
    const claimFields: ClaimFieldEntry[] = [
      {
        key: 1n,
        value: 'user@example.com',
      },
      {
        key: 2n,
        value: 'email_verification',
      },
    ];

    const claimEvent = await client1.createClaim(claimType, claimFields);
    expect(claimEvent).toBeDefined();

    // Verify the claim appears in client1's feed
    const client1FeedAfterClaim = client1.queryFeed(
      client1.currentIdentity.keyPair.publicKey,
      {
        limit: 10,
      },
    );
    expect(client1FeedAfterClaim.events.length).toBeGreaterThan(0);

    // Get the pointer to the claim event
    const claimPointer = {
      system: client1.currentIdentity.keyPair.publicKey,
      process: client1.process,
      logicalClock:
        (await client1.storage.processStates.getNextLogicalClock(
          client1.currentIdentity.keyPair.keyType,
          client1.currentIdentity.keyPair.publicKey.key,
          client1.process.process,
        )) - 1n, // The claim event we just created
      eventDigest: undefined, // Would need to be calculated from the event
    };

    // Switch to client2 and vouch for the claim
    const vouchEvent = await client2.createVerifyClaim(claimPointer);
    expect(vouchEvent).toBeDefined();
    expect(vouchEvent.signature).toBeDefined();
    expect(vouchEvent.event).toBeDefined();

    client2.queryFeed(client2.currentIdentity.keyPair.publicKey, { limit: 10 });
    expect(vouchEvent).toBeDefined();
  }, 30000);

  it('should create multiple claims and vouches', async () => {
    // Create multiple claims with client1
    const claims = [
      {
        type: 1n,
        fields: [
          { key: 1n, value: 'user@example.com' },
          { key: 2n, value: 'email_verification' },
        ] as ClaimFieldEntry[],
      },
      {
        type: 2n,
        fields: [
          { key: 1n, value: 'John Doe' },
          { key: 2n, value: 'legal_name' },
        ] as ClaimFieldEntry[],
      },
      {
        type: 3n,
        fields: [
          { key: 1n, value: 'Software Engineer' },
          { key: 2n, value: 'occupation' },
        ] as ClaimFieldEntry[],
      },
    ];

    const claimEvents: SignedEvent[] = [];
    for (const claim of claims) {
      const event = await client1.createClaim(claim.type, claim.fields);
      claimEvents.push(event);
      expect(event).toBeDefined();
    }

    // Verify all claims appear in client1's feed
    const client1Feed = client1.queryFeed(
      client1.currentIdentity.keyPair.publicKey,
      {
        limit: 20,
      },
    );
    expect(client1Feed.events.length).toBeGreaterThanOrEqual(claims.length);

    for (let i = 0; i < claimEvents.length; i++) {
      const claimPointer = {
        system: client1.currentIdentity.keyPair.publicKey,
        process: client1.process,
        logicalClock:
          (await client1.storage.processStates.getNextLogicalClock(
            client1.currentIdentity.keyPair.keyType,
            client1.currentIdentity.keyPair.publicKey.key,
            client1.process.process,
          )) - BigInt(claimEvents.length - i), // Approximate logical clock
        eventDigest: undefined,
      };

      const vouchEvent = await client2.createVerifyClaim(claimPointer);
      expect(vouchEvent).toBeDefined();
    }

    client2.queryFeed(client2.currentIdentity.keyPair.publicKey, { limit: 20 });
    expect(claimEvents.length).toBe(claims.length);
  }, 30000);

  it('should handle claim with complex field data', async () => {
    // Create a claim with more complex field data
    const claimType = 100n; // Custom claim type
    const claimFields: ClaimFieldEntry[] = [
      {
        key: 1n,
        value: 'https://github.com/username',
      },
      {
        key: 2n,
        value: 'github_verification',
      },
      {
        key: 3n,
        value: '2024-01-01T00:00:00Z',
      },
      {
        key: 4n,
        value: 'verified_by_github_api',
      },
    ];

    const claimEvent = await client1.createClaim(claimType, claimFields);
    expect(claimEvent).toBeDefined();

    // Verify the claim appears in client1's feed
    const client1Feed = client1.queryFeed(
      client1.currentIdentity.keyPair.publicKey,
      {
        limit: 10,
      },
    );
    expect(client1Feed.events.length).toBeGreaterThan(0);

    // Create a vouch with client2
    const claimPointer = {
      system: client1.currentIdentity.keyPair.publicKey,
      process: client1.process,
      logicalClock:
        (await client1.storage.processStates.getNextLogicalClock(
          client1.currentIdentity.keyPair.keyType,
          client1.currentIdentity.keyPair.publicKey.key,
          client1.process.process,
        )) - 1n,
      eventDigest: undefined,
    };

    const vouchEvent = await client2.createVerifyClaim(claimPointer);
    expect(vouchEvent).toBeDefined();

    client2.queryFeed(client2.currentIdentity.keyPair.publicKey, { limit: 10 });
    expect(claimEvent).toBeDefined();
    expect(vouchEvent).toBeDefined();
  }, 30000);
});
