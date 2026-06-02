import type { PolycentricClient } from '../polycentric-client';
import * as Proto from '../proto/v2';
import { bytesToHex } from '../utils/hex';

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

  private async signMessage(
    messageBytes: Uint8Array,
  ): Promise<Proto.SignedMessage> {
    if (!this.client.currentKeyPair) throw new Error('No active key pair');
    const signature = await this.client.crypto.sign(
      this.client.currentKeyPair.privateKey.key,
      messageBytes,
      this.client.currentKeyPair.keyType,
    );
    return Proto.SignedMessage.create({
      signature,
      messageBytes,
      publicKey: this.client.currentKeyPair.publicKey,
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
    const signedMessage = await this.signMessage(pairingSessionBytes);

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

  async joinPairingSession(
    pairingSessionSignature: string,
    server: string,
  ): Promise<PairingSessionView> {
    const bodyBytes = Proto.JoinPairingSessionBody.toBinary(
      Proto.JoinPairingSessionBody.create({
        pairingSessionSignature,
      }),
    );
    const signedMessage = await this.signMessage(bodyBytes);

    const sessionBytes = await this.client.core.joinPairingSession(
      server,
      Proto.SignedMessage.toBinary(signedMessage).buffer as ArrayBuffer,
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
}
