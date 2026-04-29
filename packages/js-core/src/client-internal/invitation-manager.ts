import type { PolycentricClient } from '../polycentric-client';
import * as Proto from '../proto/v2';
import {
  claimInvitation,
  createInvitation,
  getInvitationStatus,
} from '../grpc/transport';
import { bytesToHex } from '../utils/hex';

export interface ActiveInvitation {
  code: string;
  identityKey: string;
  createdAt: Date;
  ttlSeconds: number;
  claimers: Proto.PublicKey[];
  expired: boolean;
  server: string;
}

export class InvitationManager {
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

  async createInvitation(identityKey: string): Promise<ActiveInvitation> {
    const server = this.client.servers[0];
    if (!server) throw new Error('No servers configured');

    const invitationBytes = Proto.IdentityInvitation.toBinary(
      Proto.IdentityInvitation.create({
        identity: identityKey,
        createdAt: BigInt(Date.now()),
      }),
    );
    const signedMessage = await this.signMessage(invitationBytes);

    const invitation = Proto.IdentityInvitation.fromBinary(
      await createInvitation(server, signedMessage),
    );

    return {
      code: bytesToHex(signedMessage.signature),
      identityKey: invitation.identity,
      createdAt: new Date(Number(invitation.createdAt)),
      ttlSeconds: invitation.ttlSeconds,
      claimers: [],
      expired: false,
      server,
    };
  }

  async getInvitationStatus(
    inviteCode: string,
    server?: string,
  ): Promise<Proto.InvitationStatus> {
    const targetServer = server ?? this.client.servers[0];
    if (!targetServer) throw new Error('No servers configured');

    const status = Proto.InvitationStatus.fromBinary(
      await getInvitationStatus(targetServer, inviteCode),
    );

    if (!status.invitation) {
      throw new Error('Invitation not found');
    }
    return status;
  }

  async claimInvitation(
    inviteCode: string,
    server: string,
  ): Promise<Proto.InvitationStatus> {
    const bodyBytes = Proto.ClaimInvitationBody.toBinary(
      Proto.ClaimInvitationBody.create({ invitationSignature: inviteCode }),
    );
    const signedMessage = await this.signMessage(bodyBytes);

    const status = Proto.InvitationStatus.fromBinary(
      await claimInvitation(server, signedMessage),
    );

    if (!status.invitation) {
      throw new Error('Invitation not found');
    }
    return status;
  }
}
