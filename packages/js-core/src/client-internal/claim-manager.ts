import type { PolycentricClient } from "../polycentric-client";
import {
  ClaimFieldEntry,
  SignedEvent,
  Claim,
  ContentType,
  PublicKey,
  Process,
  EventCreationData,
  Pointer,
  Reference,
} from "../proto/polycentric";

export class ClaimManager {
  constructor(private readonly client: PolycentricClient) {}

  async createClaim(
    claimType: bigint,
    fields: ClaimFieldEntry[],
  ): Promise<SignedEvent> {
    const claim = Claim.create({
      claimType,
      fields,
    });

    const eventData = EventCreationData.create({
      contentType: ContentType.CLAIM,
      content: Claim.toBinary(claim),
      system: PublicKey.create({
        keyType: this.client.currentIdentity.keyPair.keyType,
        key: this.client.currentIdentity.keyPair.publicKey.key,
      }),
      process: Process.create({
        process: this.client.process.process,
      }),
    });

    return this.client.createEventRaw(eventData);
  }

  async createVerifyClaim(targetPointer: Pointer): Promise<SignedEvent> {
    const targetReference = Reference.create({
      referenceType: 0n, // TODO: Create Proto ReferenceType enum, 0: local, 1: remote (verify that this is correct)
      reference: Pointer.toBinary(targetPointer),
    });

    const eventData = EventCreationData.create({
      contentType: ContentType.VOUCH,
      references: [targetReference],
      system: PublicKey.create({
        keyType: this.client.currentIdentity.keyPair.keyType,
        key: this.client.currentIdentity.keyPair.publicKey.key,
      }),
      process: Process.create({
        process: this.client.process.process,
      }),
    });

    return this.client.createEventRaw(eventData);
  }
}
