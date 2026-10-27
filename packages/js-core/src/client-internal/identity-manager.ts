import { ed25519 } from '@noble/curves/ed25519.js';
import { COLLECTION, KEY_TYPE, SyncStrategy } from '../constants';
import { ServerAlreadyAddedError } from '../errors';
import type { PolycentricClient } from '../polycentric-client';
import * as Proto from '../proto/v2';
import { bytesEqual } from '../utils/bytes';

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
  /**
   * Optional recovery key for recovering access when there are no active
   * sessions. Its only use is for producing recovery signatures.
   */
  recoveryKey: Proto.PublicKey | null;
}

/**
 * Arguments for publishing an update to an existing identity.
 */
export interface PublishArgs {
  rotationKeys: Proto.PublicKey[];
  signingKeys: Proto.PublicKey[];
  servers?: string[] | null;
  revocationBounds?: Proto.RevocationBound[];
  recoveryKey?: Proto.PublicKey | null;
  recoverySignature?: Uint8Array | null;
}

/** Information about a published identity event. */
export interface IdentityUpdate {
  identityKey: string;
  signedEvent: Proto.SignedEvent;
}

/** New, unpublished identity content. */
export interface IdentityDraft {
  identity: Proto.Identity;
  content: Proto.Content;
}

/**
 * IdentityManager owns identity lifecycle operations — publishing, key
 * rotation — and the authorization checks that go with them.
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
  resolveIdentity(identityKey?: string): IdentityState | null {
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
      recoveryKey: identity.recoveryKey ?? null,
    };
  }

  /**
   * Derive an identity document content from the provided args.
   * Does not do any validation or authorization checks.
   */
  draftIdentityContent(args: PublishArgs): IdentityDraft {
    const {
      rotationKeys,
      signingKeys,
      servers = null,
      revocationBounds = [],
      recoveryKey = null,
      recoverySignature = null,
    } = args;

    const identity = Proto.Identity.create({
      rotationKeys,
      signingKeys,
      revocationBounds,
      servers: servers ? { urls: servers } : undefined,
      recoveryKey: recoveryKey ?? undefined,
      recoverySignature: recoverySignature ?? undefined,
    });

    const content = Proto.Content.create({
      contentBody: { oneofKind: 'identity', identity },
    });

    return { identity, content };
  }

  /**
   * Publish an update to the current identity state.
   */
  async publishUpdate(args: PublishArgs): Promise<IdentityUpdate> {
    // Require an active login
    const identityKey = this.client.activeIdentityKey;
    const keyPair = this.client.currentKeyPair;
    if (!identityKey || !keyPair) {
      throw new Error('Must be logged in to publish identity updates.');
    }

    // Check authorization
    const oldHead = this.resolveIdentity(identityKey);
    if (!oldHead) throw new Error('No existing identity chain to extend');

    const isAuthorized = oldHead.rotationKeys.some((key) =>
      IdentityManager.keysEqual(key, keyPair.publicKey),
    );

    if (!isAuthorized) {
      throw new Error('This keypair is not authorized for identity rotation');
    }

    // Create event/content
    const { content } = this.draftIdentityContent(args);
    const digest = this.client.contentManager.buildDigest(content);
    await this.client.storage.content.save(digest, content);

    const event = await this.client.buildEvent(
      content,
      COLLECTION.IDENTITY,
      identityKey,
    );

    // Persist locally
    const signedEvent = await this.client.signEvent(event, keyPair);
    await this.client.commitEvent(signedEvent, content);

    // Push to servers
    // Push errors are currently swallowed
    await this.client.sync(SyncStrategy.PARTIAL_PUSH);

    return { identityKey, signedEvent };
  }

  isRotationKeyForIdentity(
    identityKey: string,
    publicKey: Proto.PublicKey,
  ): boolean {
    const state = this.resolveIdentity(identityKey);
    if (!state) return false;
    return state.rotationKeys.some((k) =>
      IdentityManager.keysEqual(k, publicKey),
    );
  }

  /**
   * Adds a signing key to the current identity and publishes the updated document.
   */
  async addSigningKey(publicKey: Proto.PublicKey): Promise<Proto.SignedEvent> {
    const state = this.resolveIdentity();
    if (!state) throw new Error('No active identity');

    const signingKeys = [...state.signingKeys, publicKey];
    const { signedEvent } = await this.publishUpdate({ ...state, signingKeys });
    return signedEvent;
  }

  /**
   * Removes a signing key from the current identity and publishes the updated document.
   */
  async removeSigningKey(
    publicKey: Proto.PublicKey,
  ): Promise<Proto.SignedEvent> {
    const state = this.resolveIdentity();
    if (!state) throw new Error('No active identity');

    const signingKeys = state.signingKeys.filter(
      (k) => !bytesEqual(k.key, publicKey.key),
    );
    const { signedEvent } = await this.publishUpdate({ ...state, signingKeys });
    return signedEvent;
  }

  /**
   * Adds a rotation key to the current identity and publishes the updated document.
   */
  async addRotationKey(publicKey: Proto.PublicKey): Promise<Proto.SignedEvent> {
    const state = this.resolveIdentity();
    if (!state) throw new Error('No active identity');

    const keyExists = state.rotationKeys.some((k) =>
      IdentityManager.keysEqual(k, publicKey),
    );
    if (keyExists) {
      throw new Error('Rotation key already exists');
    }

    const rotationKeys = [...state.rotationKeys, publicKey];
    const { signedEvent } = await this.publishUpdate({
      ...state,
      rotationKeys,
    });
    return signedEvent;
  }

  /**
   * Removes a rotation key from the current identity and publishes the updated document.
   */
  async removeRotationKey(
    publicKey: Proto.PublicKey,
  ): Promise<Proto.SignedEvent> {
    const state = this.resolveIdentity();
    if (!state) throw new Error('No active identity');

    const rotationKeys = state.rotationKeys.filter(
      (k) => !IdentityManager.keysEqual(k, publicKey),
    );
    const { signedEvent } = await this.publishUpdate({
      ...state,
      rotationKeys,
    });
    return signedEvent;
  }

  /**
   * Adds a server to the current identity document and publishes the update.
   * Calls the server's `GetInfo` first — an unreachable server is not added.
   */
  async addServer(url: string): Promise<Proto.SignedEvent> {
    const state = this.resolveIdentity();
    if (!state) throw new Error('No active identity');

    // An identity that has never configured its list starts from the
    // client's effective (default) servers.
    const servers = state.servers ?? this.client.servers;
    if (servers.includes(url)) {
      throw new ServerAlreadyAddedError();
    }

    await this.client.core.getServerInfo(url);

    const { signedEvent } = await this.publishUpdate({
      ...state,
      servers: [...servers, url],
    });
    return signedEvent;
  }

  /**
   * Removes a server from the current identity document and publishes the
   * update.
   */
  async removeServer(url: string): Promise<Proto.SignedEvent> {
    const state = this.resolveIdentity();
    if (!state) throw new Error('No active identity');

    const current = state.servers ?? this.client.servers;
    const servers = current.filter((s) => s !== url);
    if (servers.length === current.length) {
      throw new Error('Server not found');
    }

    const { signedEvent } = await this.publishUpdate({ ...state, servers });
    return signedEvent;
  }

  /**
   * Generate a new recovery keypair for the active identity and publish
   * a new identity event with it.
   * Returns the private key so it can be saved.
   */
  async rotateRecoveryKey(): Promise<Proto.PrivateKey> {
    const state = this.resolveIdentity();
    if (!state) throw new Error('No active identity');

    const keyType = KEY_TYPE.ED25519;

    // Generate new key pair for recovery
    const { privateKey, publicKey } =
      await this.client.crypto.generateKeyPair(keyType);

    // Try persisting a identity new event locally and publishing it to servers
    await this.publishUpdate({
      ...state,
      recoveryKey: { keyType, key: publicKey },
    });

    return { keyType, key: privateKey };
  }

  /**
   * Returns whether `privateKey` is the corresponding private key to the
   * recovery public key stored on `identityKey`, defaulting to the active
   * identity.
   */
  checkRecoveryKey(
    privateKey: Proto.PrivateKey,
    identityKey?: string,
  ): boolean {
    if (privateKey.keyType !== KEY_TYPE.ED25519) return false;

    const recoveryKey = this.resolveIdentity(identityKey)?.recoveryKey;
    if (!recoveryKey || recoveryKey.keyType !== KEY_TYPE.ED25519) return false;

    let derived: Uint8Array;
    try {
      derived = ed25519.getPublicKey(privateKey.key);
    } catch {
      return false;
    }

    return bytesEqual(derived, recoveryKey.key);
  }
}
