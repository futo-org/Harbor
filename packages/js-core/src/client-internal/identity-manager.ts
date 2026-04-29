import { sha256 } from '@noble/hashes/sha2';
import { COLLECTION } from '../constants';
import { getIdentityState } from '../grpc/transport';
import type { PolycentricClient } from '../polycentric-client';
import * as Proto from '../proto/v2';
import { bytesEqual } from '../utils/bytes';
import { bytesToHex } from '../utils/hex';
import { verifyEventBundle } from '../utils/verify-bundle';

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

    // If no identity key provided, compute from initial Identity content
    if (!identityKey) {
      const identityBytes = Proto.Identity.toBinary(identity);
      identityKey = bytesToHex(sha256(identityBytes), 32);
    }

    const digest = this.client.contentManager.buildDigest(content);

    const sequence = this.client.core!.next_sequence(
      identityKey,
      COLLECTION.IDENTITY,
      Proto.PublicKey.toBinary(this.client.currentKeyPair.publicKey),
    );

    const event = Proto.Event.create({
      key: Proto.EventKey.create({
        collection: COLLECTION.IDENTITY,
        identity: identityKey,
        signedBy: this.client.currentKeyPair.publicKey,
        sequence,
      }),
      previousSignature: new Uint8Array(0),
      contentDigest: digest,
      createdAt: BigInt(Date.now()),
    });

    await this.client.storage.content.save(digest, content);
    const signedEvent = await this.client.signEvent(event);
    this.client.setActiveIdentityKey(identityKey);
    await this.client.commitEvent(signedEvent, content);

    return { identityKey, signedEvent };
  }

  /**
   * Adds a signing key to the current identity and publishes the updated document.
   */
  async addSigningKey(
    identityKey: string,
    publicKey: Proto.PublicKey,
  ): Promise<Proto.SignedEvent> {
    const state = await this.getCurrent();
    if (state.identityKey !== identityKey) {
      throw new Error('Identity key mismatch');
    }

    const signingKeys = [...state.signingKeys, publicKey];
    const { signedEvent } = await this.publish(
      identityKey,
      state.rotationKeys,
      signingKeys,
    );
    return signedEvent;
  }

  /**
   * Removes a signing key from the current identity and publishes the updated document.
   */
  async removeSigningKey(
    identityKey: string,
    publicKey: Proto.PublicKey,
  ): Promise<Proto.SignedEvent> {
    const state = await this.getCurrent();
    if (state.identityKey !== identityKey) {
      throw new Error('Identity key mismatch');
    }

    const signingKeys = state.signingKeys.filter(
      (k) => !bytesEqual(k.key, publicKey.key),
    );
    const { signedEvent } = await this.publish(
      identityKey,
      state.rotationKeys,
      signingKeys,
    );
    return signedEvent;
  }

  /**
   * Fetches the latest identity state of any identity.
   * Checks that the event bundle is validly signed,
   * and that the signer is a rotation key for the identity.
   *
   * This does NOT check:
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

    const bundle = Proto.EventBundle.fromBinary(
      await getIdentityState(targetServer, identityKey),
    );

    const valid = await verifyEventBundle(bundle, this.client.cryptoManager);
    if (!valid) {
      throw new Error(`Identity ${identityKey} bundle failed verification`);
    }

    const signedEvent = bundle.signedEvent;
    const serializedContent = bundle.serializedContent;
    if (!signedEvent || !serializedContent) {
      throw new Error(`Identity ${identityKey} not found`);
    }

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
   * Claims an identity by pulling its latest Identity document from the server
   * and storing it locally. Verifies the current key is listed in the identity's
   * rotation_keys or signing_keys.
   */
  async claim(identityKey: string): Promise<IdentityState> {
    if (!this.client.currentKeyPair) throw new Error('No active key pair');

    const bundles = await this.client.listEvents({
      identity: identityKey,
      collection: COLLECTION.IDENTITY,
    });

    for (const bundle of bundles) {
      if (!bundle.signedEvent) continue;

      if (bundle.serializedContent?.contentBytes) {
        const event = Proto.Event.fromBinary(bundle.signedEvent.eventBytes);
        if (event.contentDigest) {
          await this.client.storage.content.save(
            event.contentDigest,
            Proto.Content.fromBinary(bundle.serializedContent.contentBytes),
          );
        }
      }

      await this.client.storage.events.save(bundle.signedEvent);
    }

    this.client.setActiveIdentityKey(identityKey);
    const foundState = await this.getCurrent();
    if (!foundState.identityKey) {
      throw new Error(`Identity ${identityKey} not found on any server`);
    }

    const publicKey = this.client.currentKeyPair.publicKey;
    const isAuthorized =
      foundState.rotationKeys.some((k) =>
        IdentityManager.keysEqual(k, publicKey),
      ) ||
      foundState.signingKeys.some((k) =>
        IdentityManager.keysEqual(k, publicKey),
      );

    if (!isAuthorized) {
      throw new Error('Current key is not authorized for this identity');
    }

    return foundState;
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

    if (versions.length === 0) return true;

    versions.sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );

    let active = versions[versions.length - 1];
    if (atTime !== undefined) {
      active = versions[0];
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

  async addRotationKey(
    identityKey: string,
    publicKey: Proto.PublicKey,
  ): Promise<Proto.SignedEvent> {
    const state = await this.getCurrent();
    if (state.identityKey !== identityKey) {
      throw new Error('Identity key mismatch');
    }

    const keyExists = state.rotationKeys.some((k) =>
      IdentityManager.keysEqual(k, publicKey),
    );
    if (keyExists) {
      throw new Error('Rotation key already exists');
    }

    const rotationKeys = [...state.rotationKeys, publicKey];
    const { signedEvent } = await this.publish(
      identityKey,
      rotationKeys,
      state.signingKeys,
    );
    return signedEvent;
  }

  async removeRotationKey(
    identityKey: string,
    publicKey: Proto.PublicKey,
  ): Promise<Proto.SignedEvent> {
    const state = await this.getCurrent();
    if (state.identityKey !== identityKey) {
      throw new Error('Identity key mismatch');
    }

    const rotationKeys = state.rotationKeys.filter(
      (k) => !IdentityManager.keysEqual(k, publicKey),
    );
    const { signedEvent } = await this.publish(
      identityKey,
      rotationKeys,
      state.signingKeys,
    );
    return signedEvent;
  }
}
