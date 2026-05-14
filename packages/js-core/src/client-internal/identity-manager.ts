import { sha256 } from '@noble/hashes/sha2';
import { Query, QueryStatus } from '@polycentric/rs-core-uniffi-web/generated';
import { COLLECTION } from '../constants';
import type { PolycentricClient } from '../polycentric-client';
import * as Proto from '../proto/v2';
import { bytesEqual } from '../utils/bytes';
import { bytesToHex } from '../utils/hex';

/**
 * Resolved identity state from the latest Identity document.
 */
export interface IdentityState {
  /** The identity key (hex-encoded sha256 of the initial Identity content) */
  identityKey: string | null;
  /** Rotation keys that control the identity */
  rotationKeys: Proto.PublicKey[];
  /** Signing keys authorized to sign events */
  signingKeys: Proto.PublicKey[];
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
   * Resolves the current identity state by finding the latest Identity
   * document on the identity collection for the active key pair.
   */
  async getCurrent(): Promise<IdentityState> {
    const state: IdentityState = {
      identityKey: null,
      rotationKeys: [],
      signingKeys: [],
    };

    if (!this.client.activeIdentityKey) return state;

    // TODO: Fix this so it doesn't need to go over all events
    const allEvents = await this.client.storage.events.getAll();
    let highestSequence = BigInt(-1);

    for (const signedEvent of allEvents) {
      const event = Proto.Event.fromBinary(signedEvent.eventBytes);

      if (event.key?.collection !== COLLECTION.IDENTITY) continue;
      if (event.key.identity !== this.client.activeIdentityKey) continue;
      if (!event.contentDigest) continue;
      if (event.key.sequence <= highestSequence) continue;

      const content = await this.client.storage.content.get(
        event.contentDigest,
      );
      if (!content) continue;

      if (content.contentBody.oneofKind === 'identity') {
        const identity = content.contentBody.identity;
        highestSequence = event.key.sequence;
        state.identityKey = event.key.identity;
        state.rotationKeys = [...identity.rotationKeys];
        state.signingKeys = [...identity.signingKeys];
      }
    }

    return state;
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
  ): Promise<{ identityKey: string; signedEvent: Proto.SignedEvent }> {
    if (!this.client.currentKeyPair) {
      throw new Error('No active key pair');
    }

    const identity = Proto.Identity.create({ rotationKeys, signingKeys });
    const content = Proto.Content.create({
      contentBody: { oneofKind: 'identity', identity },
    });

    const isBootstrap = identityKey === null;
    if (isBootstrap) {
      if (
        rotationKeys.length !== 1 ||
        signingKeys.length !== 0 ||
        !IdentityManager.keysEqual(
          rotationKeys[0],
          this.client.currentKeyPair.publicKey,
        )
      ) {
        throw new Error(
          'Initial identity must have exactly one rotation key (the current key) and no signing keys',
        );
      }
      const identityBytes = Proto.Identity.toBinary(identity);
      identityKey = bytesToHex(sha256(identityBytes), 32);
    }
    const resolvedIdentityKey: string = identityKey!;

    const digest = this.client.contentManager.buildDigest(content);
    await this.client.storage.content.save(digest, content);
    this.client.setActiveIdentityKey(resolvedIdentityKey);

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
    await this.client.push();

    return { identityKey: resolvedIdentityKey, signedEvent };
  }

  /**
   * Fetches the latest identity state of any identity.
   * Checks that the event is validly signed,
   * and that the signer is a rotation key for the identity.
   *
   * This does NOT check:
   * - if serialized content matches event.content_digest
   * - if the vector clocks are valid
   * - if a more recent identity state exists
   * - if the full identity collection is valid
   */
  async fetchIdentityState(
    identityKey: string,
    server?: string,
  ): Promise<IdentityState> {
    const targetServer = server ?? this.client.servers[0];
    if (!targetServer) throw new Error('No servers configured');

    // Ask targetServer for the latest identity event for the identity.
    // This is specifically intended for polling while pairing to an identity.
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const observable = this.client.core.fetchQuery(
        ['list_events_for_server', targetServer, identityKey],
        new Query.ListEvents({
          size: 1,
          identity: identityKey,
          collection: COLLECTION.IDENTITY,
        }),
        { servers: [targetServer] },
      );
      const subscription = observable.subscribe({
        next: (result) => {
          if (result.status === QueryStatus.Success) {
            subscription.unsubscribe();
            resolve(new Uint8Array(result.data ?? new ArrayBuffer(0)));
          }
        },
        error: (message: string) => {
          subscription.unsubscribe();
          reject(new Error(message));
        },
        complete: () => {},
      });
    });
    const response = Proto.ListEventsResponse.fromBinary(bytes);
    const bundle = response.eventBundles[0];

    if (!bundle?.signedEvent || !bundle.serializedContent) {
      throw new Error(`Identity ${identityKey} not found`);
    }

    const signedEvent = bundle.signedEvent;
    const serializedContent = bundle.serializedContent;

    // Verify signature against event.key.signed_by via core.
    this.client.core.verifySignedEvent(
      Proto.SignedEvent.toBinary(signedEvent).buffer as ArrayBuffer,
    );

    const event = Proto.Event.fromBinary(signedEvent.eventBytes);
    const signedBy = event.key?.signedBy;
    if (!signedBy) {
      throw new Error('Identity event missing signed_by');
    }

    const content = Proto.Content.fromBinary(serializedContent.contentBytes);
    const identity =
      content.contentBody.oneofKind === 'identity'
        ? content.contentBody.identity
        : undefined;
    if (!identity) {
      throw new Error('Event content is not an Identity');
    }

    // Verify that the event signer is a rotation key on the identity.
    // This is just a basic precaution.
    // We should ideally check that the signer was a rotation key in the previous
    // identity state, and validate the full identity collection history.
    //
    const signerIsRotationKey = identity.rotationKeys.some((k) =>
      IdentityManager.keysEqual(k, signedBy),
    );
    if (!signerIsRotationKey) {
      throw new Error('Identity event not signed by a rotation key');
    }

    return {
      identityKey,
      rotationKeys: [...identity.rotationKeys],
      signingKeys: [...identity.signingKeys],
    };
  }

  /**
   * Claims an identity: verifies the current key is authorized on it, then
   * sets it active and pulls the full identity event history.
   */
  async claim(identityKey: string): Promise<IdentityState> {
    if (!this.client.currentKeyPair) throw new Error('No active key pair');

    const state = await this.fetchIdentityState(identityKey);
    const publicKey = this.client.currentKeyPair.publicKey;
    const isAuthorized =
      state.rotationKeys.some((k) => IdentityManager.keysEqual(k, publicKey)) ||
      state.signingKeys.some((k) => IdentityManager.keysEqual(k, publicKey));
    if (!isAuthorized) {
      throw new Error('Current key is not authorized for this identity');
    }

    this.client.setActiveIdentityKey(identityKey);
    await this.client.pull();

    // Re-publish the same identity document signed by our own key,
    // proving this key acknowledged its membership.
    await this.publish(identityKey, state.rotationKeys, state.signingKeys);

    return state;
  }

  async isRotationKeyForIdentity(
    identityKey: string,
    publicKey: Proto.PublicKey,
  ): Promise<boolean> {
    const state = await this.getCurrent();
    if (state.identityKey !== identityKey) return false;
    return state.rotationKeys.some((k) =>
      IdentityManager.keysEqual(k, publicKey),
    );
  }

  /**
   * Check whether a public key was authorized (as rotation or signing key)
   * for a given identity at a specific time. Returns true if the identity is
   * not found locally (caller may not have pulled the identity yet).
   *
   * This does NOT check:
   * - if a more recent identity state exists
   * - if the signatures or vector clocks are valid
   */
  async isKeyAuthorized(
    identityKey: string,
    signerKey: Uint8Array,
    atTime?: bigint,
  ): Promise<boolean> {
    const allEvents = await this.client.storage.events.getAll();

    // Build timeline of identity versions sorted by createdAt
    const versions: {
      createdAt: bigint;
      rotationKeys: Proto.PublicKey[];
      signingKeys: Proto.PublicKey[];
    }[] = [];

    for (const se of allEvents) {
      const ev = Proto.Event.fromBinary(se.eventBytes);
      if (ev.key?.collection !== COLLECTION.IDENTITY) continue;
      if (ev.key.identity !== identityKey) continue;
      if (!ev.contentDigest) continue;

      const c = await this.client.storage.content.get(ev.contentDigest);
      if (!c) continue;

      if (c.contentBody.oneofKind === 'identity') {
        versions.push({
          createdAt: ev.createdAt,
          rotationKeys: [...c.contentBody.identity.rotationKeys],
          signingKeys: [...c.contentBody.identity.signingKeys],
        });
      }
    }

    if (versions.length === 0) return true; // identity not found locally

    versions.sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );

    // Find the identity version active at the given time (or latest if no time)
    let active = versions[versions.length - 1];
    if (atTime !== undefined) {
      active = versions[0]; // fallback to first
      for (const v of versions) {
        if (v.createdAt <= atTime) active = v;
        else break;
      }
    }

    return (
      active.rotationKeys.some((k) => bytesEqual(k.key, signerKey)) ||
      active.signingKeys.some((k) => bytesEqual(k.key, signerKey))
    );
  }

  /**
   * Adds a signing key to the current identity and publishes the updated document.
   */
  async addSigningKey(publicKey: Proto.PublicKey): Promise<Proto.SignedEvent> {
    const state = await this.getCurrent();
    if (!state.identityKey) throw new Error('No active identity');

    const signingKeys = [...state.signingKeys, publicKey];
    const { signedEvent } = await this.publish(
      state.identityKey,
      state.rotationKeys,
      signingKeys,
    );
    return signedEvent;
  }

  /**
   * Removes a signing key from the current identity and publishes the updated document.
   */
  async removeSigningKey(
    publicKey: Proto.PublicKey,
  ): Promise<Proto.SignedEvent> {
    const state = await this.getCurrent();
    if (!state.identityKey) throw new Error('No active identity');

    const signingKeys = state.signingKeys.filter(
      (k) => !bytesEqual(k.key, publicKey.key),
    );
    const { signedEvent } = await this.publish(
      state.identityKey,
      state.rotationKeys,
      signingKeys,
    );
    return signedEvent;
  }

  /**
   * Adds a rotation key to the current identity and publishes the updated document.
   */
  async addRotationKey(publicKey: Proto.PublicKey): Promise<Proto.SignedEvent> {
    const state = await this.getCurrent();
    if (!state.identityKey) throw new Error('No active identity');

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
    );
    return signedEvent;
  }

  /**
   * Removes a rotation key from the current identity and publishes the updated document.
   */
  async removeRotationKey(
    publicKey: Proto.PublicKey,
  ): Promise<Proto.SignedEvent> {
    const state = await this.getCurrent();
    if (!state.identityKey) throw new Error('No active identity');

    const rotationKeys = state.rotationKeys.filter(
      (k) => !IdentityManager.keysEqual(k, publicKey),
    );
    const { signedEvent } = await this.publish(
      state.identityKey,
      rotationKeys,
      state.signingKeys,
    );
    return signedEvent;
  }
}
