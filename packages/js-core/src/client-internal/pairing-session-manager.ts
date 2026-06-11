import { KEY_TYPE, SyncStrategy } from '../constants';
import type { UnlockedKey } from '../platform-interfaces';
import type { PolycentricClient } from '../polycentric-client';
import * as Proto from '../proto/v2';
import { bytesToHex, keysEqual } from '../utils';

export interface ActivePairingSession {
  code: string;
  identityKey: string;
  createdAt: Date;
  expiresAt: Date;
  signedBy: Proto.PublicKey;
  claimers: Proto.PublicKey[];
  server: string;
}

export interface PairingSessionView {
  session: Proto.PairingSession;
  claimerPubkeys: Proto.PublicKey[];
  pairingSession: {
    issuerIdentity: string;
    createdAt: Date;
    expiresAt: Date;
    signedBy: Proto.PublicKey;
  };
  claimers: Proto.PublicKey[];
}

export class PairingSessionManager {
  constructor(private readonly client: PolycentricClient) {}

  /** In-memory state for an in-progress pairing claim. */
  private pendingClaim: {
    identityKey: string;
    unlocked: UnlockedKey;
    publicKey: Proto.PublicKey;
    authorizedRole: 'rotation' | 'signing' | null;
    server: string;
  } | null = null;

  get pendingClaimIdentityKey(): string | null {
    return this.pendingClaim?.identityKey ?? null;
  }

  get pendingClaimIsRotation(): boolean {
    return this.pendingClaim?.authorizedRole === 'rotation';
  }

  get pendingClaimKey(): Proto.PublicKey | null {
    return this.pendingClaim?.publicKey ?? null;
  }

  clearPendingClaim(): void {
    this.pendingClaim = null;
  }

  private async signMessage(
    messageBytes: Uint8Array,
    signer: Proto.PublicKey,
  ): Promise<Proto.SignedMessage> {
    const signature = await this.client.keyPairManager.sign(
      messageBytes,
      signer,
    );
    return Proto.SignedMessage.create({
      signature,
      messageBytes,
      publicKey: signer,
    });
  }

  /**
   * Creates a signed pairing session and registers it on the target server.
   * @param identityKey Identity key to embed in the session payload.
   * @param server Server URL that will store and serve the session.
   * @returns Session metadata returned from the server.
   */
  async createPairingSessionOnServer(
    identityKey: string,
    server: string,
  ): Promise<ActivePairingSession> {
    const pairingSessionBytes = Proto.InitialPairingSession.toBinary(
      Proto.InitialPairingSession.create({
        issuerIdentity: identityKey,
        timestamp: BigInt(Date.now()),
      }),
    );
    // The issuer must sign a pairing session with a rotation key.
    const signer = await this.client.identityManager.resolveSigner({
      requireRotation: true,
    });
    const signedMessage = await this.signMessage(pairingSessionBytes, signer);

    const sessionBytes = await this.client.core.createPairingSession(
      server,
      Proto.SignedMessage.toBinary(signedMessage).buffer as ArrayBuffer,
    );
    const session = Proto.PairingSession.fromBinary(
      new Uint8Array(sessionBytes),
    );

    return {
      code: bytesToHex(signedMessage.signature),
      identityKey: session.issuerIdentity,
      createdAt: new Date(Number(session.createdAt)),
      expiresAt: new Date(Number(session.expiresAt)),
      signedBy: session.signedBy!,
      claimers: [],
      server,
    };
  }

  async getPairingSessionStatus(
    pairingSessionSignature: string,
    server?: string,
  ): Promise<PairingSessionView> {
    const targetServer = server ?? this.client.servers[0];
    if (!targetServer) throw new Error('No servers configured');

    const sessionBytes = await this.client.core.getPairingSession(
      targetServer,
      pairingSessionSignature,
    );
    const session = Proto.PairingSession.fromBinary(
      new Uint8Array(sessionBytes),
    );
    return {
      session,
      claimerPubkeys: [...session.claimerPubkeys],
      pairingSession: {
        issuerIdentity: session.issuerIdentity,
        createdAt: new Date(Number(session.createdAt)),
        expiresAt: new Date(Number(session.expiresAt)),
        signedBy: session.signedBy!,
      },
      claimers: [...session.claimerPubkeys],
    };
  }

  async startPairingSession(
    pairingSessionSignature: string,
    server: string,
  ): Promise<PairingSessionView> {
    const { privateKey, publicKey: publicKeyBytes } =
      await this.client.cryptoManager.generateKeyPair(KEY_TYPE.ED25519);
    const unlocked: UnlockedKey = {
      persistedKey: {
        key_type: KEY_TYPE.ED25519,
        public_key: publicKeyBytes,
        private_key: privateKey,
      },
      isProtected: false,
      unlockedPrivateKey: privateKey,
    };
    const publicKey = Proto.PublicKey.create({
      keyType: unlocked.persistedKey.key_type,
      key: unlocked.persistedKey.public_key,
    });

    const bodyBytes = Proto.JoinPairingSessionBody.toBinary(
      Proto.JoinPairingSessionBody.create({ pairingSessionSignature }),
    );
    // Sign with the in-memory private key directly; it isn't persisted yet,
    // so keyPairManager.sign (which looks up the key store) can't find it.
    const signature = await this.client.crypto.sign(
      privateKey,
      bodyBytes,
      unlocked.persistedKey.key_type,
    );
    const signedMessage = Proto.SignedMessage.create({
      signature,
      messageBytes: bodyBytes,
      publicKey,
    });

    const sessionBytes = await this.client.core.joinPairingSession(
      server,
      Proto.SignedMessage.toBinary(signedMessage).buffer as ArrayBuffer,
    );
    const session = Proto.PairingSession.fromBinary(
      new Uint8Array(sessionBytes),
    );

    this.pendingClaim = {
      identityKey: session.issuerIdentity,
      unlocked,
      publicKey,
      authorizedRole: null,
      server,
    };

    return {
      session,
      claimerPubkeys: [...session.claimerPubkeys],
      pairingSession: {
        issuerIdentity: session.issuerIdentity,
        createdAt: new Date(Number(session.createdAt)),
        expiresAt: new Date(Number(session.expiresAt)),
        signedBy: session.signedBy!,
      },
      claimers: [...session.claimerPubkeys],
    };
  }

  async checkPairingAuthorization(
    server: string,
  ): Promise<'rotation' | 'signing' | null> {
    const pending = this.pendingClaim;
    if (!pending) return null;

    // Fetch the identity state from the server
    const state = await this.client.identityManager.fetchIdentityState(
      pending.identityKey,
      server,
    );

    const isRotation = state.rotationKeys.some((k) =>
      keysEqual(k, pending.publicKey),
    );
    const isSigning = state.signingKeys.some((k) =>
      keysEqual(k, pending.publicKey),
    );

    if (isRotation || isSigning) {
      const role = isRotation ? 'rotation' : 'signing';
      pending.authorizedRole = role;
      return role;
    }

    return null;
  }

  async commitPairing(shouldSecure: boolean): Promise<void> {
    const pending = this.pendingClaim;
    if (!pending) throw new Error('No pending claim to commit');

    const server = pending.server;
    if (!this.client.servers.includes(server)) {
      this.client.servers.push(server);
    }

    await this.client.storage.keys.insert(pending.unlocked.persistedKey);

    this.client.identityManager.activeIdentityKey = pending.identityKey;

    if (pending.authorizedRole === 'rotation' && shouldSecure) {
      await this.client.keyPairManager.setProtected(pending.publicKey, true);
    }

    // Pull the issuer's identity history to persist it in the local database.
    await this.client.sync(SyncStrategy.PARTIAL_PULL);

    const state = await this.client.identityManager.getIdentityState(
      pending.identityKey,
    );
    const isRotation = state.rotationKeys.some((k) =>
      keysEqual(k, pending.publicKey),
    );
    pending.authorizedRole = isRotation ? 'rotation' : 'signing';

    await this.client.identityManager.ensureAcknowledged(
      pending.identityKey,
      pending.publicKey,
    );

    if (pending.authorizedRole === 'rotation' && shouldSecure) {
      await this.client.identityManager.addWarmSigningKey(
        pending.identityKey,
        pending.unlocked,
      );
    }

    await this.client.sync(SyncStrategy.PARTIAL_PUSH);
  }
}
