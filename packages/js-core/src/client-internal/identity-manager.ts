import { sha256 } from '@noble/hashes/sha2.js';
import { COLLECTION, SyncStrategy } from '../constants';
import { ServerAlreadyAddedError } from '../errors';
import type { PolycentricClient } from '../polycentric-client';
import * as Proto from '../proto/v2';
import { bytesEqual } from '../utils/bytes';
import { bytesToHex } from '../utils/hex';

/**
 * Resolved identity state from the latest Identity document.
 */
export interface IdentityState {
  /** The identity key (hex-encoded sha256 of the initial Identity content) */
  identityKey: string;
  /** Rotation keys that control the identity */
  rotationKeys: Proto.PublicKey[];
  /** Signing keys authorized to sign events */
  signingKeys: Proto.PublicKey[];
  /** Bounds keeping pre-revocation events from revoked signers valid. */
  revocationBounds: Proto.RevocationBound[];
  /**
   * Servers this identity pushes to and pulls from. `null` when the
   * identity has never configured its list (clients fall back to their
   * defaults); an empty array is an intentionally empty list.
   */
  servers: string[] | null;
}

/**
 * IdentityManager owns all identity lifecycle operations — publishing,
 * claiming, key rotation — and the authorization checks that go with them.
 */
export class IdentityManager {
  static keysEqual(a: Proto.PublicKey, b: Proto.PublicKey): boolean {
    return a.keyType === b.keyType && bytesEqual(a.key, b.key);
  }

  constructor(private readonly client: PolycentricClient) {}

  /**
   * Resolves an identity's latest known valid state from rs-core's store.
   * Defaults to the active identity, if any.
   * Returns `null` if there is no identity to check or no valid chain can
   * be found locally for the given identity.
   */
  async resolveIdentity(identityKey?: string): Promise<IdentityState | null> {
    const key = identityKey ?? this.client.activeIdentityKey;
    if (!key) return null;

    const identityBytes = this.client.core.resolveIdentity(key);
    if (!identityBytes) return null;

    const identity = Proto.Identity.fromBinary(new Uint8Array(identityBytes));

    return {
      identityKey: key,
      rotationKeys: identity.rotationKeys,
      signingKeys: identity.signingKeys,
      revocationBounds: identity.revocationBounds,
      servers: identity.servers ? identity.servers.urls : null,
    };
  }

  /**
   * Publishes a new Identity document with the given rotation and signing keys.
   *
   * The identity key is the hex-encoded sha256 of the initial Identity content.
   * For a new identity, pass null for identityKey and it will be computed.
   */
  async publish(
    identityKey: string | null,
    rotationKeys: Proto.PublicKey[],
    signingKeys: Proto.PublicKey[],
    servers: string[] | null = null,
    revocationBounds: Proto.RevocationBound[] = [],
  ): Promise<{ identityKey: string; signedEvent: Proto.SignedEvent }> {
    if (!this.client.currentKeyPair) {
      throw new Error('No active key pair');
    }

    const identity = Proto.Identity.create({
      rotationKeys,
      signingKeys,
      revocationBounds,
      servers: servers ? { urls: servers } : undefined,
    });
    const content = Proto.Content.create({
      contentBody: { oneofKind: 'identity', identity },
    });

    const isBootstrap = identityKey === null;
    if (isBootstrap) {
      if (
        rotationKeys.length !== 1 ||
        signingKeys.length !== 0 ||
        revocationBounds.length !== 0 ||
        !IdentityManager.keysEqual(
          rotationKeys[0],
          this.client.currentKeyPair.publicKey,
        )
      ) {
        throw new Error(
          'Initial identity must have exactly one rotation key (the current key), no signing keys and no revocation bounds',
        );
      }
      const identityBytes = Proto.Identity.toBinary(identity);
      identityKey = bytesToHex(sha256(identityBytes), 32);
    }
    const resolvedIdentityKey: string = identityKey!;

    const digest = this.client.contentManager.buildDigest(content);
    await this.client.storage.content.save(digest, content);
    await this.client.setActiveIdentityKey(resolvedIdentityKey);

    let event: Proto.Event;
    if (isBootstrap) {
      // The bootstrap identity event
      // sequence = 1, identitySequence = 1, vectorClock = [1] for the sole signer.
      event = Proto.Event.create({
        key: Proto.EventKey.create({
          collection: COLLECTION.IDENTITY,
          identity: resolvedIdentityKey,
          signedBy: this.client.currentKeyPair.publicKey,
          sequence: 1n,
        }),
        identitySequence: 1n,
        vectorClock: Proto.VectorClock.create({ sequence: [1n] }),
        previousSignature: new Uint8Array(0),
        contentDigest: digest,
        createdAt: BigInt(Date.now()),
      });
    } else {
      event = await this.client.buildEvent(content, COLLECTION.IDENTITY);
    }

    const signedEvent = await this.client.signEvent(event);
    await this.client.commitEvent(signedEvent, content);

    // The identity document is the source of truth for the server list, so
    // adopt it before syncing — a newly added server receives the push.
    if (servers) {
      this.client.servers = [...servers];
      this.client.core.setServers(this.client.servers);
    }

    await this.client.sync(SyncStrategy.PARTIAL_PUSH);

    return { identityKey: resolvedIdentityKey, signedEvent };
  }

  /**
   * Poll a specific server and return a marker for its knowledge of the identity
   * events belonging to the specified identity.
   * Claimers should try claiming again each time the returned value changes.
   */
  async pollRemoteIdentityMarker(
    identityKey: string,
    server?: string,
  ): Promise<bigint | null> {
    const targetServer = server ?? this.client.servers[0];
    if (!targetServer) throw new Error('No servers configured');

    const responseBytes = await this.client.core.listHeads(
      targetServer,
      Proto.ListHeadsRequest.toBinary({ identity: identityKey })
        .buffer as ArrayBuffer,
    );

    const response = Proto.ListHeadsResponse.fromBinary(
      new Uint8Array(responseBytes),
    );

    // The marker will be the sum of the identity heads or null if there are none
    let marker: bigint | null = null;

    for (const head of response.heads) {
      if (head.collection !== COLLECTION.IDENTITY) continue;
      if (head.identity !== identityKey) continue;
      marker = (marker ?? 0n) + head.sequence;
    }

    return marker;
  }

  /**
   * Attempt to claim an identity:
   * - Fetch the identity's chain
   * - Check that we are authorized
   * - Adopt the identity and pull its events
   * - Re-publish the identity event under our signing key
   *
   * Returns the new identity state on success or `null` on recoverable
   * failure. Throws on error.
   */
  async claim(identityKey: string): Promise<IdentityState | null> {
    if (!this.client.currentKeyPair) throw new Error('No active key pair');
    const publicKey = this.client.currentKeyPair.publicKey;

    // Hydrate all known identity events for `identityKey` to rs-core
    await this.client.listEvents({
      identity: identityKey,
      collection: COLLECTION.IDENTITY,
    });

    // Check that we are authorized
    let state = await this.resolveIdentity(identityKey);
    if (!state || !this.checkAuthorized(state, publicKey)) return null;

    // Adopt the identity and pull in its events
    await this.client.setActiveIdentityKey(identityKey);
    await this.client.sync(SyncStrategy.PARTIAL_PULL);

    // Ensure we are still authorized after pulling
    state = await this.resolveIdentity(identityKey);
    if (!state || !this.checkAuthorized(state, publicKey)) {
      throw new Error('Lost authorization');
    }

    // Re-publish the same identity document signed by our own key,
    // proving this key acknowledged its membership.
    await this.publish(
      identityKey,
      state.rotationKeys,
      state.signingKeys,
      state.servers,
      state.revocationBounds,
    );

    return state;
  }

  /**
   * Helper method for `claim()`.
   * Returns whether `state` contains `myKey` as either a rotation or signing key.
   */
  private checkAuthorized(
    state: IdentityState,
    myKey: Proto.PublicKey,
  ): boolean {
    return (
      state.rotationKeys.some((k) => IdentityManager.keysEqual(k, myKey)) ||
      state.signingKeys.some((k) => IdentityManager.keysEqual(k, myKey))
    );
  }

  async isRotationKeyForIdentity(
    identityKey: string,
    publicKey: Proto.PublicKey,
  ): Promise<boolean> {
    const state = await this.resolveIdentity(identityKey);
    if (!state) return false;
    return state.rotationKeys.some((k) =>
      IdentityManager.keysEqual(k, publicKey),
    );
  }

  /**
   * Adds a signing key to the current identity and publishes the updated document.
   */
  async addSigningKey(publicKey: Proto.PublicKey): Promise<Proto.SignedEvent> {
    const state = await this.resolveIdentity();
    if (!state) throw new Error('No active identity');

    const signingKeys = [...state.signingKeys, publicKey];
    const { signedEvent } = await this.publish(
      state.identityKey,
      state.rotationKeys,
      signingKeys,
      state.servers,
      state.revocationBounds,
    );
    return signedEvent;
  }

  /**
   * Removes a signing key from the current identity and publishes the updated document.
   */
  async removeSigningKey(
    publicKey: Proto.PublicKey,
  ): Promise<Proto.SignedEvent> {
    const state = await this.resolveIdentity();
    if (!state) throw new Error('No active identity');

    const signingKeys = state.signingKeys.filter(
      (k) => !bytesEqual(k.key, publicKey.key),
    );
    const { signedEvent } = await this.publish(
      state.identityKey,
      state.rotationKeys,
      signingKeys,
      state.servers,
      state.revocationBounds,
    );
    return signedEvent;
  }

  /**
   * Adds a rotation key to the current identity and publishes the updated document.
   */
  async addRotationKey(publicKey: Proto.PublicKey): Promise<Proto.SignedEvent> {
    const state = await this.resolveIdentity();
    if (!state) throw new Error('No active identity');

    const keyExists = state.rotationKeys.some((k) =>
      IdentityManager.keysEqual(k, publicKey),
    );
    if (keyExists) {
      throw new Error('Rotation key already exists');
    }

    const rotationKeys = [...state.rotationKeys, publicKey];
    const { signedEvent } = await this.publish(
      state.identityKey,
      rotationKeys,
      state.signingKeys,
      state.servers,
      state.revocationBounds,
    );
    return signedEvent;
  }

  /**
   * Removes a rotation key from the current identity and publishes the updated document.
   */
  async removeRotationKey(
    publicKey: Proto.PublicKey,
  ): Promise<Proto.SignedEvent> {
    const state = await this.resolveIdentity();
    if (!state) throw new Error('No active identity');

    const rotationKeys = state.rotationKeys.filter(
      (k) => !IdentityManager.keysEqual(k, publicKey),
    );
    const { signedEvent } = await this.publish(
      state.identityKey,
      rotationKeys,
      state.signingKeys,
      state.servers,
      state.revocationBounds,
    );
    return signedEvent;
  }

  /**
   * Adds a server to the current identity document and publishes the update.
   * Calls the server's `GetInfo` first — an unreachable server is not added.
   */
  async addServer(url: string): Promise<Proto.SignedEvent> {
    const state = await this.resolveIdentity();
    if (!state) throw new Error('No active identity');

    // An identity that has never configured its list starts from the
    // client's effective (default) servers.
    const servers = state.servers ?? this.client.servers;
    if (servers.includes(url)) {
      throw new ServerAlreadyAddedError();
    }

    await this.client.core.getServerInfo(url);

    const { signedEvent } = await this.publish(
      state.identityKey,
      state.rotationKeys,
      state.signingKeys,
      [...servers, url],
      state.revocationBounds,
    );
    return signedEvent;
  }

  /**
   * Removes a server from the current identity document and publishes the
   * update.
   */
  async removeServer(url: string): Promise<Proto.SignedEvent> {
    const state = await this.resolveIdentity();
    if (!state) throw new Error('No active identity');

    const current = state.servers ?? this.client.servers;
    const servers = current.filter((s) => s !== url);
    if (servers.length === current.length) {
      throw new Error('Server not found');
    }

    const { signedEvent } = await this.publish(
      state.identityKey,
      state.rotationKeys,
      state.signingKeys,
      servers,
      state.revocationBounds,
    );
    return signedEvent;
  }
}
