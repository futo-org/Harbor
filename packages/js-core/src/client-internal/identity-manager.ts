import type { PolycentricClient } from '../polycentric-client';
import { COLLECTION } from '../constants';
import * as Proto from '../proto/v2';
import { sha256 } from '@noble/hashes/sha2';

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

    for (const signedEvent of allEvents) {
      const event = Proto.Event.fromBinary(signedEvent.eventBytes);

      if (event.key?.collection !== COLLECTION.IDENTITY) continue;
      if (event.key.identity !== this.client.activeIdentityKey) continue;
      if (!event.contentDigest) continue;

      const content = await this.client.storage.content.get(
        event.contentDigest,
      );
      if (!content) continue;

      if (content.contentBody.oneofKind === 'identity') {
        const identity = content.contentBody.identity;
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
      identityKey = this.toHex(sha256(identityBytes), 32);
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
    await this.client.commitEvent(signedEvent, content);

    this.client.setActiveIdentityKey(identityKey);

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
      (k) => !this.bytesEqual(k.key, publicKey.key),
    );
    const { signedEvent } = await this.publish(
      identityKey,
      state.rotationKeys,
      signingKeys,
    );
    return signedEvent;
  }

  /**
   * Claims an identity by pulling its latest Identity document from the server
   * and storing it locally. Verifies the current key is listed in the identity's
   * rotation_keys or signing_keys.
   */
  async claim(identityKey: string): Promise<IdentityState> {
    if (!this.client.core) throw new Error('Core not initialized');
    if (!this.client.currentKeyPair) throw new Error('No active key pair');

    const publicKey = this.client.currentKeyPair.publicKey.key;

    // Pull identity events from all servers
    for (const server of this.client.servers) {
      try {
        const responseBytes = await this.client.core.list_events(
          server,
          null,
          identityKey,
          COLLECTION.IDENTITY,
        );
        const response = Proto.ListEventsResponse.fromBinary(responseBytes);

        for (const bundle of response.eventBundles) {
          if (!bundle.signedEvent) continue;

          // Store content
          if (bundle.serializedContent?.contentBytes) {
            const event = Proto.Event.fromBinary(bundle.signedEvent.eventBytes);
            if (event.contentDigest) {
              await this.client.storage.content.save(
                event.contentDigest,
                Proto.Content.fromBinary(bundle.serializedContent.contentBytes),
              );
            }
          }

          // Store event
          try {
            await this.client.storage.events.save(bundle.signedEvent);
          } catch {
            // duplicate, skip
          }
        }
      } catch {
        // server unreachable, try next
      }
    }

    // Find the identity document among pulled events and verify authorization
    const allEvents = await this.client.storage.events.getAll();
    let foundState: IdentityState | null = null;

    for (const se of allEvents) {
      const ev = Proto.Event.fromBinary(se.eventBytes);
      if (ev.key?.collection !== COLLECTION.IDENTITY) continue;
      if (ev.key.identity !== identityKey) continue;
      if (!ev.contentDigest) continue;

      const c = await this.client.storage.content.get(ev.contentDigest);
      if (!c) continue;

      if (c.contentBody.oneofKind === 'identity') {
        foundState = {
          identityKey,
          rotationKeys: [...c.contentBody.identity.rotationKeys],
          signingKeys: [...c.contentBody.identity.signingKeys],
        };
      }
    }

    if (!foundState) {
      throw new Error(`Identity ${identityKey} not found on any server`);
    }

    const isAuthorized =
      foundState.rotationKeys.some((k) => this.bytesEqual(k.key, publicKey)) ||
      foundState.signingKeys.some((k) => this.bytesEqual(k.key, publicKey));

    if (!isAuthorized) {
      throw new Error('Current key is not authorized for this identity');
    }

    this.client.setActiveIdentityKey(identityKey);

    return foundState;
  }

  /**
   * Check whether a public key was authorized (as rotation or signing key)
   * for a given identity at a specific time. Returns true if the identity is
   * not found locally (caller may not have pulled the identity yet).
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
      active.rotationKeys.some((k) => this.bytesEqual(k.key, signerKey)) ||
      active.signingKeys.some((k) => this.bytesEqual(k.key, signerKey))
    );
  }

  private bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private toHex(bytes: Uint8Array, len = 8): string {
    return Array.from(bytes.slice(0, len))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
