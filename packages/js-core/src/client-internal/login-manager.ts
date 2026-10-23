import { sha256 } from '@noble/hashes/sha2.js';
import { COLLECTION, SyncStrategy } from '../constants';
import type { LoginId } from '../platform-interfaces/login-repository';
import type { KeyPair, PolycentricClient } from '../polycentric-client';
import * as Proto from '../proto/v2';
import { KeyType, PrivateKey, PublicKey } from '../proto/v2';
import { bytesToHex } from '../utils/hex';
import {
  IdentityManager,
  type IdentityState,
  type PublishArgs,
} from './identity-manager';

export type SignupInfo = {
  login: LoginId;
  keyPair: KeyPair;
  genesisEvent: Proto.SignedEvent;
  identityContent: Proto.Content;
  serializedContent: Proto.SerializedContent;
};

export class LoginManager {
  constructor(private readonly client: PolycentricClient) {}

  async generateKeyPair(keyType?: KeyType): Promise<KeyPair> {
    if (!keyType) {
      keyType = KeyType.ED25519;
    }

    const { privateKey: privateKeyRaw, publicKey: publicKeyRaw } =
      await this.client.crypto.generateKeyPair(keyType);

    const privateKey = PrivateKey.create({
      keyType,
      key: privateKeyRaw,
    });
    const publicKey = PublicKey.create({
      keyType,
      key: publicKeyRaw,
    });

    return { privateKey, publicKey, keyType };
  }

  /**
   * Attempt to claim an identity:
   * - Fetch the identity's chain
   * - Check that we are authorized
   * - Adopt the identity and pull its events
   * - Re-publish the identity event under our signing key
   *
   * Returns the adopted identity state. Throws on any failure.
   */
  async claim(
    identityKey: string,
    keyPair: KeyPair,
    servers?: string[],
  ): Promise<IdentityState> {
    this.assertCurrentKeyPair(keyPair);
    const publicKey = keyPair.publicKey;

    // Hydrate all known identity events for `identityKey` to rs-core
    await this.client.listEvents({
      identity: identityKey,
      collection: COLLECTION.IDENTITY,
      queryOpts: { servers },
    });

    // Check that we are authorized
    const state = this.client.identityManager.resolveIdentity(identityKey);
    if (!state || !this.checkAuthorized(state, publicKey)) {
      throw new Error('Unable to verify authorization');
    }

    // Persist all of the identity events needed to authorize us.
    const chain = this.client.resolveIdentityChain(identityKey);
    await this.client.saveBundles(chain);

    // Re-publish the same identity document signed by our own key,
    // proving this key acknowledged its membership.
    // This call will commit another identity event and switch our active
    // identity to `identityKey`.
    await this.client.identityManager.publish({ ...state, isLogin: true });

    // Sync in this identity's other events in the background.
    this.client
      .sync(SyncStrategy.PARTIAL_PULL)
      .catch((e) => console.error(`Pull error after claim: ${e}`));

    return state;
  }

  /**
   * Copy a backup's identity chain into rs-core, so that resolving the identity
   * accounts for what the backup knows.
   * The identity chain is not persisted to local storage but will remain cached
   * by rs-core.
   */
  copyBackupEvents(backup: Proto.IdentityBackup): void {
    const events: ArrayBuffer[] = [];
    const contents: { digestBytes: ArrayBuffer; contentBytes: ArrayBuffer }[] =
      [];

    for (const bundle of backup.identityChain) {
      const { signedEvent, serializedContent } = bundle;
      if (!signedEvent) continue;

      events.push(
        Proto.SignedEvent.toBinary(signedEvent).buffer as ArrayBuffer,
      );

      if (!serializedContent) continue;

      let digest: Proto.ContentDigest;
      try {
        const event = Proto.Event.fromBinary(signedEvent.eventBytes);
        if (!event.contentDigest) continue;
        digest = event.contentDigest;
      } catch {
        continue;
      }

      const digestBytes = Proto.ContentDigest.toBinary(digest)
        .buffer as ArrayBuffer;
      const contentBytes = serializedContent.contentBytes.slice()
        .buffer as ArrayBuffer;
      contents.push({ digestBytes, contentBytes });
    }

    try {
      this.client.core.copyContents(contents);
      this.client.core.copyEvents(events);
    } catch (e) {
      console.warn(`Backup data failed to copy: ${e}`);
    }
  }

  /**
   * Query all relevant servers for identity events and copy them to rs-core.
   */
  private async discoverRemoteIdentityEvents(
    identityKey: string,
  ): Promise<void> {
    const queriedServers = new Set<string>();

    // TODO: online-only fetch mode so that we can skip the local cache here.

    // Each round, query any servers that we have discovered from this identity
    // but haven't queried yet.
    // Stop when we have queried all servers.
    // We expect to have only one round in most cases.
    while (true) {
      const identityState =
        this.client.identityManager.resolveIdentity(identityKey);
      const latestServers = identityState?.servers?.length
        ? identityState.servers
        : this.client.servers;

      const serversToQuery = latestServers.filter(
        (s) => !queriedServers.has(s),
      );
      if (serversToQuery.length === 0) break;

      try {
        // The events discovered by this query will be stored in rs-core
        await this.client.listEvents({
          identity: identityKey,
          collection: COLLECTION.IDENTITY,
          queryOpts: {
            servers: [...new Set(serversToQuery)],
          },
        });
      } catch (e) {
        console.error(`Listing identity events failed: ${e}`);
      }

      for (const queried of serversToQuery) {
        queriedServers.add(queried);
      }
    }
  }

  /**
   * Use the backup to authorize `keyPair` and log in.
   */
  async recoverIdentity(
    keyPair: KeyPair,
    backup: Proto.IdentityBackup,
  ): Promise<void> {
    this.assertCurrentKeyPair(keyPair);
    const publicKey = keyPair.publicKey;

    const identityKey = backup.identityKey;
    const recoveryKey = backup.recoveryKey;
    if (!recoveryKey) throw new Error('Backup has no recovery key');

    // Copy backup events to rs-core so we can easily read off the identity head
    this.copyBackupEvents(backup);

    const backupState =
      this.client.identityManager.resolveIdentity(identityKey);
    if (!backupState) throw new Error('Backup has no valid identity chain');

    // Include remote knowledge of the identity chain
    await this.discoverRemoteIdentityEvents(identityKey);

    // This is the identity head that we will work from
    const state = this.client.identityManager.resolveIdentity(identityKey);
    if (!state) throw new Error('No valid identity chain to recover');

    // Confirm that our recovery will be accepted
    if (
      !this.client.identityManager.checkRecoveryKey(recoveryKey, identityKey)
    ) {
      throw new Error('Unable to recover this identity with this backup');
    }

    const payload = new Uint8Array(
      this.client.core.assembleRecoveryPayload(
        identityKey,
        Proto.PublicKey.toBinary(publicKey).buffer as ArrayBuffer,
      ),
    );

    const recoverySignature = await this.client.crypto.sign(
      recoveryKey.key,
      payload,
      recoveryKey.keyType,
    );

    // Only add our key if it's not there already
    const alreadyListed = state.rotationKeys.some((key) =>
      IdentityManager.keysEqual(key, publicKey),
    );

    const rotationKeys = alreadyListed
      ? state.rotationKeys
      : [...state.rotationKeys, publicKey];

    const publishArgs: PublishArgs = {
      ...state,
      isLogin: true,
      rotationKeys,
      recoverySignature,
    };

    // Ensure we have the required identity events to authorize ourself
    // persisted.
    // We persist the existing chain now, and then `publish()` tries to add
    // the final event that we need.
    const identityChain = this.client.resolveIdentityChain(identityKey);
    await this.client.saveBundles(identityChain);

    // This call will attempt the identity switch and bail if it fails.
    await this.client.identityManager.publish(publishArgs);

    // Best effort sync.
    // We have already published the new identity event, so we won't bail out
    // on failure.
    try {
      await this.client.sync(SyncStrategy.PARTIAL_PULL);
    } catch (err: unknown) {
      console.warn('Pull failed after identity recovery:', err);
    }
  }

  /**
   * `publish()` still signs with the client's current key pair, so login
   * flows can only act on that key pair for now.
   *
   * TODO: Remove this once we have alternatives to `publish()` for creating
   * identity events.
   */
  private assertCurrentKeyPair(keyPair: KeyPair): void {
    const current = this.client.currentKeyPair;
    if (
      !current ||
      !IdentityManager.keysEqual(current.publicKey, keyPair.publicKey)
    ) {
      throw new Error('Key pair must match the current key pair');
    }
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

  /**
   * Generate a key pair and persist it as a pending signup.
   */
  async beginSignup(): Promise<SignupInfo> {
    const keyPair = await this.generateKeyPair();

    const identity = Proto.Identity.create({
      rotationKeys: [keyPair.publicKey],
      signingKeys: [],
      revocationBounds: [],
      servers: { urls: [...this.client.servers] },
    });
    const content = Proto.Content.create({
      contentBody: { oneofKind: 'identity', identity },
    });

    const identityKey = bytesToHex(
      sha256(Proto.Identity.toBinary(identity)),
      32,
    );

    // The bootstrap identity event
    // sequence = 1, identitySequence = 1, vectorClock = [1] for the sole signer.
    const event = Proto.Event.create({
      key: Proto.EventKey.create({
        collection: COLLECTION.IDENTITY,
        identity: identityKey,
        signedBy: keyPair.publicKey,
        sequence: 1n,
      }),
      identitySequence: 1n,
      vectorClock: Proto.VectorClock.create({ sequence: [1n] }),
      previousSignature: new Uint8Array(0),
      contentDigest: this.client.contentManager.buildDigest(content),
      createdAt: BigInt(Date.now()),
      application: this.client.application,
    });

    const genesisEvent = await this.client.signEvent(event, keyPair);

    await this.client.storage.logins.putLogin(
      identityKey,
      keyPair,
      'pendingSignup',
    );

    return {
      login: { identity: identityKey, publicKey: keyPair.publicKey },
      keyPair,
      genesisEvent,
      identityContent: content,
      serializedContent: Proto.SerializedContent.create({
        contentBytes: Proto.Content.toBinary(content),
      }),
    };
  }

  /**
   * Update the login's status to be an active rotation key.
   */
  async finishSignup(loginId: LoginId): Promise<void> {
    await this.client.storage.logins.changeLoginStatus(
      loginId.identity,
      loginId.publicKey,
      'liveRotationKey',
    );
  }
}
