import { sha256 } from '@noble/hashes/sha2.js';
import { Query, QueryStatus } from '@polycentric/rs-core-uniffi-web/generated';
import { COLLECTION, KEY_TYPE } from '../constants';
import type { UnlockedKey } from '../platform-interfaces';
import type { PolycentricClient } from '../polycentric-client';
import * as Proto from '../proto/v2';
import { bytesEqual } from '../utils/bytes';
import { bytesToHex, keysEqual, publicKeyToString } from '../utils';

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

interface CachedIdentityState {
  identityKey: string;
  previousSignature: Uint8Array;
  state: IdentityState;
  acknowledgedKeys: Set<string>;
}

/**
 * IdentityManager owns all identity lifecycle operations — publishing,
 * claiming, key rotation — and the authorization checks that go with them.
 */
export class IdentityManager {
  constructor(private readonly client: PolycentricClient) {}

  /** The identity this client is currently acting as, or null. */
  activeIdentityKey: string | null = null;
  private cachedIdentity: CachedIdentityState | null = null;

  /** Adopt the most-recently-recorded identity as active. */
  async loadActive(): Promise<void> {
    const mostRecent = await this.client.storage.identities.getMostRecent();
    this.activeIdentityKey = mostRecent?.identityKey ?? null;
  }

  /**
   * Resolves the current identity state by finding the latest Identity
   * document on the identity collection for the active key pair.
   */
  async getCurrent(): Promise<IdentityState> {
    const identityKey = this.activeIdentityKey;
    if (!identityKey) {
      return { identityKey: null, rotationKeys: [], signingKeys: [] };
    }
    return this.getIdentityState(identityKey);
  }

  /**
   * An identity's latest declared state (rotation + signing keys)
   */
  async getIdentityState(identityKey: string): Promise<IdentityState> {
    const currentSig = new Uint8Array(
      this.client.core.previousSignature(identityKey, COLLECTION.IDENTITY),
    );

    if (
      this.cachedIdentity &&
      this.cachedIdentity.identityKey === identityKey &&
      bytesEqual(this.cachedIdentity.previousSignature, currentSig)
    ) {
      return this.cachedIdentity.state;
    }

    const bundles = this.client.listValidEvents(
      identityKey,
      COLLECTION.IDENTITY,
    );
    let highestSequence = BigInt(-1);
    let rotationKeys: Proto.PublicKey[] = [];
    let signingKeys: Proto.PublicKey[] = [];
    const acknowledgedKeys = new Set<string>();
    let found = false;

    for (const bundle of bundles) {
      if (!bundle.signedEvent) {
        continue;
      }
      const event = Proto.Event.fromBinary(bundle.signedEvent.eventBytes);
      if (!event.key) continue;

      if (bundle.serializedContent?.contentBytes) {
        const content = Proto.Content.fromBinary(
          bundle.serializedContent.contentBytes,
        );
        if (
          content.contentBody.oneofKind === 'identity' &&
          event.key.sequence > highestSequence
        ) {
          highestSequence = event.key.sequence;
          rotationKeys = [...content.contentBody.identity.rotationKeys];
          signingKeys = [...content.contentBody.identity.signingKeys];
          found = true;
        }
      }

      if (event.key.signedBy) {
        acknowledgedKeys.add(publicKeyToString(event.key.signedBy));
      }
    }

    const state = {
      identityKey: found ? identityKey : null,
      rotationKeys,
      signingKeys,
    };

    this.cachedIdentity = {
      identityKey,
      previousSignature: currentSig,
      state,
      acknowledgedKeys,
    };

    return state;
  }

  /**
   * Pick a locally-held member key for the active identity to sign with.
   */
  async resolveSigner({
    requireRotation,
  }: {
    requireRotation: boolean;
  }): Promise<Proto.PublicKey> {
    const identityKey = this.activeIdentityKey;
    if (!identityKey) {
      throw new Error('No active identity');
    }

    const [info, localKeys] = await Promise.all([
      this.getIdentityState(identityKey),
      this.client.storage.keys.getAllKeys(),
    ]);
    const candidates = requireRotation
      ? info.rotationKeys
      : [...info.rotationKeys, ...info.signingKeys];

    const heldRow = (candidate: Proto.PublicKey) =>
      localKeys.find((k) => bytesEqual(k.public_key, candidate.key));
    const held = candidates.filter((c) => heldRow(c));
    // Unprotected (plaintext private key in hand) signs without a prompt.
    const isUnprotected = (c: Proto.PublicKey) => !!heldRow(c)?.private_key;

    const signer = held.find(isUnprotected) ?? held[0];
    if (signer) {
      await this.ensureAcknowledged(identityKey, signer);
      return signer;
    }

    throw new Error(
      `No valid locally-held ${requireRotation ? 'rotation ' : ''}key for the active identity`,
    );
  }

  /**
   * Ensure the key has acknowledged itself on the identity.
   */
  async ensureAcknowledged(
    identityKey: string,
    key: Proto.PublicKey,
  ): Promise<void> {
    const [info, alreadyAcked] = await Promise.all([
      this.getIdentityState(identityKey),
      this.hasAcknowledged(identityKey, key),
    ]);
    if (alreadyAcked) return;
    await this.commitIdentityEvent(
      identityKey,
      info.rotationKeys,
      info.signingKeys,
      {
        signer: key,
      },
    );
  }

  /**
   * Checks whether a key pair has acknowledged its membership.
   */
  private async hasAcknowledged(
    identityKey: string,
    key: Proto.PublicKey,
  ): Promise<boolean> {
    await this.getIdentityState(identityKey);
    if (
      this.cachedIdentity &&
      this.cachedIdentity.identityKey === identityKey
    ) {
      return this.cachedIdentity.acknowledgedKeys.has(publicKeyToString(key));
    }
    return false;
  }

  /**
   * Record which of this client's local keys we associate with `identityKey`.
   */
  private async recordHeldKeys(
    identityKey: string,
    identityKeys: Proto.PublicKey[],
  ): Promise<void> {
    const [localKeys, existing] = await Promise.all([
      this.client.storage.keys.getAllKeys(),
      this.client.storage.identities.getRecord(identityKey),
    ]);

    const heldKeys = [...(existing?.heldKeys ?? [])];
    const seen = new Set(
      heldKeys.map((key) => `${key.keyType}:${bytesToHex(key.key)}`),
    );
    for (const key of identityKeys) {
      const held = localKeys.some((lk) => bytesEqual(lk.public_key, key.key));
      if (!held) continue;
      const id = `${key.keyType}:${bytesToHex(key.key)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      heldKeys.push(key);
    }

    await this.client.storage.identities.saveRecord({
      identityKey,
      heldKeys,
      updatedAt: Date.now(),
    });
  }

  /**
   * Creates a brand new identity. The rotation key is protected when the
   * platform supports it (falling back to an unprotected key if protection is
   * unavailable or the user declines). When the rotation key is protected, a
   * separate unprotected "warm" signing key is also minted and acknowledged so
   * everyday signing never triggers an unlock prompt; an unprotected rotation
   * key is already warm, so that step is skipped.
   *
   * The just-generated rotation key is passed as `unlockedSigner` so a
   * protected key prompts at most once (at credential creation), not on every
   * identity event signed here.
   */
  async createIdentity(opts?: { protect?: boolean }): Promise<{
    identityKey: string;
    signedEvent: Proto.SignedEvent;
  }> {
    const rotation = await this.client.keyPairManager.generate(
      KEY_TYPE.ED25519,
      {
        protected: opts?.protect ?? true,
        strict: opts?.protect ?? true,
      },
    );
    const rotationKey = Proto.PublicKey.create({
      keyType: rotation.persistedKey.key_type,
      key: rotation.persistedKey.public_key,
    });

    // Bootstrap the identity, signed with the in-hand rotation key (no prompt).
    const result = await this.commitIdentityEvent(null, [rotationKey], [], {
      unlockedSigner: rotation,
    });

    // A protected rotation key needs a warm signing key for everyday signing;
    // an unprotected rotation key is already warm, so skip.
    if (rotation.isProtected) {
      await this.addWarmSigningKey(result.identityKey, rotation);
    }

    return result;
  }

  /**
   * Mint an unprotected "warm" signing key, add it to the identity (signed by
   * the in-hand rotation key, so no unlock prompt), and acknowledge it. Used
   * wherever a device holds a protected rotation key but needs a warm key for
   * prompt-free everyday signing - new identities and rotation-authority device
   * pairing alike.
   */
  async addWarmSigningKey(
    identityKey: string,
    rotationSigner: UnlockedKey,
  ): Promise<void> {
    const warm = await this.client.keyPairManager.generate(KEY_TYPE.ED25519, {
      protected: false,
    });
    const warmKey = Proto.PublicKey.create({
      keyType: warm.persistedKey.key_type,
      key: warm.persistedKey.public_key,
    });
    const state = await this.getIdentityState(identityKey);
    await this.commitIdentityEvent(
      identityKey,
      state.rotationKeys,
      [...state.signingKeys, warmKey],
      { unlockedSigner: rotationSigner },
    );
    // Warm key acknowledges itself; it's unprotected, so no prompt.
    await this.ensureAcknowledged(identityKey, warmKey);
  }

  /**
   * Generate a fresh keypair on this device and add it as a signing key on the
   * active identity. Requires a locally-held rotation key to authorize the
   * identity change (the new key is the only signing key signed by it).
   */
  async createSigningKey(): Promise<Proto.SignedEvent> {
    const unlocked = await this.client.keyPairManager.generate(
      KEY_TYPE.ED25519,
      { protected: false },
    );
    const publicKey = Proto.PublicKey.create({
      keyType: unlocked.persistedKey.key_type,
      key: unlocked.persistedKey.public_key,
    });

    // Authorize: add the key to the identity document, signed by our rotation
    // key (the only key able to change the identity).
    const signedEvent = await this.addSigningKey(publicKey);

    // Acknowledge: the new key signs its own identity event, becoming a valid
    // member right away rather than waiting for the lazy self-heal on first use.
    const identityKey = this.activeIdentityKey;
    if (!identityKey) throw new Error('No active identity');
    await this.ensureAcknowledged(identityKey, publicKey);

    return signedEvent;
  }

  /**
   * Commit a new Identity document (rotation + signing keys) to the local log:
   * build, sign, persist, and record held keys. Does NOT sync - the caller
   * pushes to servers once all related events for the flow are committed.
   *
   * The identity key is the hex-encoded sha256 of the initial Identity content.
   * For a new identity, pass null for identityKey and it will be computed.
   */
  async commitIdentityEvent(
    identityKey: string | null,
    rotationKeys: Proto.PublicKey[],
    signingKeys: Proto.PublicKey[],
    opts?: {
      signer?: Proto.PublicKey;
      unlockedSigner?: UnlockedKey;
      requireRotationKey?: boolean;
    },
  ): Promise<{ identityKey: string; signedEvent: Proto.SignedEvent }> {
    const identity = Proto.Identity.create({ rotationKeys, signingKeys });
    const content = Proto.Content.create({
      contentBody: { oneofKind: 'identity', identity },
    });

    const isBootstrap = identityKey === null;
    if (isBootstrap) {
      if (rotationKeys.length !== 1 || signingKeys.length !== 0) {
        throw new Error(
          'Initial identity must have exactly one rotation key and no signing keys',
        );
      }
      const identityBytes = Proto.Identity.toBinary(identity);
      identityKey = bytesToHex(sha256(identityBytes), 32);
    }
    const resolvedIdentityKey: string = identityKey!;

    const digest = this.client.contentManager.buildDigest(content);
    await this.client.storage.content.save(digest, content);
    this.activeIdentityKey = resolvedIdentityKey;

    let event: Proto.Event;
    if (isBootstrap) {
      // The bootstrap identity event
      // sequence = 1, identitySequence = 1, vectorClock = [1] for the sole signer.
      event = Proto.Event.create({
        key: Proto.EventKey.create({
          collection: COLLECTION.IDENTITY,
          identity: resolvedIdentityKey,
          signedBy: rotationKeys[0],
          sequence: 1n,
        }),
        identitySequence: 1n,
        vectorClock: Proto.VectorClock.create({ sequence: [1n] }),
        previousSignature: new Uint8Array(0),
        contentDigest: digest,
        createdAt: BigInt(Date.now()),
      });
    } else {
      event = await this.client.buildEvent(content, COLLECTION.IDENTITY, opts);
    }

    const signedEvent = await this.client.signEvent(event, {
      unlockedSigner: opts?.unlockedSigner,
    });
    await this.client.commitEvent(signedEvent, content);

    await this.recordHeldKeys(resolvedIdentityKey, [
      ...rotationKeys,
      ...signingKeys,
    ]);

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
      keysEqual(k, signedBy),
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

  async isRotationKeyForIdentity(
    identityKey: string,
    publicKey: Proto.PublicKey,
  ): Promise<boolean> {
    const state = await this.getCurrent();
    if (state.identityKey !== identityKey) return false;
    return state.rotationKeys.some((k) => keysEqual(k, publicKey));
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
    const { signedEvent } = await this.commitIdentityEvent(
      state.identityKey,
      state.rotationKeys,
      signingKeys,
      { requireRotationKey: true },
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
      (k) => !keysEqual(k, publicKey),
    );
    const { signedEvent } = await this.commitIdentityEvent(
      state.identityKey,
      state.rotationKeys,
      signingKeys,
      { requireRotationKey: true },
    );
    return signedEvent;
  }

  /**
   * Adds a rotation key to the current identity and publishes the updated document.
   */
  async addRotationKey(publicKey: Proto.PublicKey): Promise<Proto.SignedEvent> {
    const state = await this.getCurrent();
    if (!state.identityKey) throw new Error('No active identity');

    const keyExists = state.rotationKeys.some((k) => keysEqual(k, publicKey));
    if (keyExists) {
      throw new Error('Rotation key already exists');
    }

    const rotationKeys = [...state.rotationKeys, publicKey];
    const { signedEvent } = await this.commitIdentityEvent(
      state.identityKey,
      rotationKeys,
      state.signingKeys,
      { requireRotationKey: true },
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
      (k) => !keysEqual(k, publicKey),
    );
    const { signedEvent } = await this.commitIdentityEvent(
      state.identityKey,
      rotationKeys,
      state.signingKeys,
      { requireRotationKey: true },
    );
    return signedEvent;
  }
}
