import type { PolycentricClient } from '../polycentric-client';
import {
  ContentType,
  EventCreationData,
  ImageManifest,
  LWWElement,
  LWWElementSet_Operation,
  Post,
  Reference,
  SignedEvent,
  PublicKey,
  Process,
  Pointer,
  Opinion,
  LWWElementSet,
  EventKey,
  Delete,
  Indices,
} from '../proto/polycentric';

export class ContentManager {
  constructor(private readonly client: PolycentricClient) {}

  private async _createLWWElementSetEvent(
    contentType: ContentType,
    value: Uint8Array,
    operation: LWWElementSet_Operation,
  ): Promise<SignedEvent> {
    const lwwElementSet = LWWElementSet.create({
      operation,
      value,
      unixMilliseconds: BigInt(Date.now()),
    });

    const eventData = EventCreationData.create({
      contentType,
      lwwElementSet,
      system: PublicKey.create({
        keyType: this.client.currentIdentity.keyPair.keyType,
        key: this.client.currentIdentity.keyPair.publicKey.key,
      }),
      process: Process.create({
        process: this.client.process.process,
      }),
    });

    return this._createEvent(eventData);
  }

  private _getReference(pointer: Pointer): EventKey | null {
    const pointerBytes = Pointer.toBinary(pointer);
    const result = this.client.core.get_reference(pointerBytes);

    if (!result) return null;

    return EventKey.fromBinary(new Uint8Array(result));
  }

  private async _createOpinion(
    opinion: Opinion,
    subjectPointer: Pointer,
  ): Promise<SignedEvent> {
    const eventKey = this._getReference(subjectPointer);
    if (!eventKey) {
      throw new Error('Could not get reference from pointer');
    }

    const subjectReference = Reference.create({
      referenceType: 2n, // TODO: Create Proto ReferenceType enum, reference type of 2 is a Pointer
      reference: Pointer.toBinary(subjectPointer),
    });

    const lwwElement = LWWElement.create({
      value: new Uint8Array([opinion]),
      unixMilliseconds: BigInt(Date.now()),
    });

    const eventData = EventCreationData.create({
      contentType: ContentType.OPINION,
      lwwElement,
      references: [subjectReference],
      system: PublicKey.create({
        keyType: this.client.currentIdentity.keyPair.keyType,
        key: this.client.currentIdentity.keyPair.publicKey.key,
      }),
      process: Process.create({
        process: this.client.process.process,
      }),
    });

    return this._createEvent(eventData);
  }

  private async _signEventCallback(
    eventBytes: Uint8Array,
  ): Promise<Uint8Array> {
    // TODO: prop to verify event in core after signing.
    const signature = await this.client.crypto.sign(
      this.client.currentIdentity.keyPair.privateKey.key,
      eventBytes,
      this.client.currentIdentity.keyPair.keyType,
    );
    const signedEvent = SignedEvent.create({
      signature,
      event: eventBytes,
      moderationTags: [],
    });
    const signedEventBytes = SignedEvent.toBinary(signedEvent);
    return signedEventBytes;
  }

  private async _getNextLogicalClockCallback(): Promise<bigint> {
    const nextClock =
      await this.client.storage.processStates.getNextLogicalClock(
        this.client.currentIdentity.keyPair.keyType,
        this.client.currentIdentity.keyPair.publicKey.key,
        this.client.process.process,
      );
    return nextClock;
  }

  private async _persistLogicalClockCallback(
    logicalClock: bigint,
  ): Promise<void> {
    await this.client.storage.processStates.persistCurrentLogicalClock(
      this.client.currentIdentity.keyPair.keyType,
      this.client.currentIdentity.keyPair.publicKey.key,
      this.client.process.process,
      logicalClock,
    );
  }

  private async _persistEventCallback(
    signedEventBytes: Uint8Array,
  ): Promise<void> {
    // TODO: verify event before persisting
    const signedEvent: SignedEvent = SignedEvent.fromBinary(signedEventBytes);
    await this.client.storage.events.persistEvent(signedEvent);
  }

  private async _createDelete(
    targetPointer: Pointer,
    contentType: ContentType,
  ): Promise<SignedEvent> {
    const deleteEvent = Delete.create({
      process: targetPointer.process,
      logicalClock: targetPointer.logicalClock,
      unixMilliseconds: BigInt(Date.now()),
      indices: Indices.create({}), // Setting the indices field is needed for server compatibility
      contentType,
    });

    const eventData = EventCreationData.create({
      contentType: ContentType.DELETE,
      content: Delete.toBinary(deleteEvent),
      references: [
        Reference.create({
          referenceType: BigInt(2), // TODO: Create Proto ReferenceType enum, reference type of 2 is a Pointer
          reference: Pointer.toBinary(targetPointer),
        }),
      ],
      system: PublicKey.create({
        keyType: this.client.currentIdentity.keyPair.keyType,
        key: this.client.currentIdentity.keyPair.publicKey.key,
      }),
      process: Process.create({
        process: this.client.process.process,
      }),
    });

    return this._createEvent(eventData);
  }

  async _createEvent(eventData: EventCreationData): Promise<SignedEvent> {
    if (this.client.currentIdentityIsEphemeral) {
      const error = new Error(
        'You cannot create events when using an ephemeral identity',
      );
      this.client.events.emitError(error);
      throw error;
    }

    const eventDataBytes = EventCreationData.toBinary(eventData);
    const signedEventBytes = await this.client.core.create_event(
      eventDataBytes,
      this._signEventCallback.bind(this),
      this._persistEventCallback.bind(this),
      this._getNextLogicalClockCallback.bind(this),
      this._persistLogicalClockCallback.bind(this),
    );
    const signedEvent = SignedEvent.fromBinary(signedEventBytes);
    this.client.events.emitContentCreated(signedEvent);
    return signedEvent;
  }

  async createPost(
    content: string,
    image?: ImageManifest,
    reference?: Reference,
  ): Promise<SignedEvent> {
    const post = Post.create({ content, image });

    const eventData = EventCreationData.create({
      contentType: ContentType.POST,
      content: Post.toBinary(post),
      references: reference ? [reference] : [],
      system: PublicKey.create({
        keyType: this.client.currentIdentity.keyPair.keyType,
        key: this.client.currentIdentity.keyPair.publicKey.key,
      }),
      process: Process.create({
        process: this.client.process.process,
      }),
    });

    return this._createEvent(eventData);
  }

  async createLike(subjectPointer: Pointer): Promise<SignedEvent> {
    return this._createOpinion(Opinion.LIKE, subjectPointer);
  }

  async createDislike(subjectPointer: Pointer): Promise<SignedEvent> {
    return this._createOpinion(Opinion.DISLIKE, subjectPointer);
  }

  async createNeutral(subjectPointer: Pointer): Promise<SignedEvent> {
    return this._createOpinion(Opinion.NEUTRAL, subjectPointer);
  }

  async setOpinion(
    subjectPointer: Pointer,
    opinion: Opinion,
  ): Promise<SignedEvent> {
    return this._createOpinion(opinion, subjectPointer);
  }

  async createUsername(username: string): Promise<SignedEvent> {
    const lwwElement = LWWElement.create({
      value: new TextEncoder().encode(username),
      unixMilliseconds: BigInt(Date.now()),
    });

    const eventData = EventCreationData.create({
      contentType: ContentType.USERNAME,
      lwwElement,
      system: PublicKey.create({
        keyType: this.client.currentIdentity.keyPair.keyType,
        key: this.client.currentIdentity.keyPair.publicKey.key,
      }),
      process: Process.create({
        process: this.client.process.process,
      }),
    });

    return this._createEvent(eventData);
  }

  async createDescription(description: string): Promise<SignedEvent> {
    const lwwElement = LWWElement.create({
      value: new TextEncoder().encode(description),
      unixMilliseconds: BigInt(Date.now()),
    });

    const eventData = EventCreationData.create({
      contentType: ContentType.DESCRIPTION,
      lwwElement,
      system: PublicKey.create({
        keyType: this.client.currentIdentity.keyPair.keyType,
        key: this.client.currentIdentity.keyPair.publicKey.key,
      }),
      process: Process.create({
        process: this.client.process.process,
      }),
    });

    return this._createEvent(eventData);
  }

  async createAvatar(avatar: ImageManifest): Promise<SignedEvent> {
    const lwwElement = LWWElement.create({
      value: ImageManifest.toBinary(avatar),
      unixMilliseconds: BigInt(Date.now()),
    });

    const eventData = EventCreationData.create({
      contentType: ContentType.AVATAR,
      lwwElement,
      system: PublicKey.create({
        keyType: this.client.currentIdentity.keyPair.keyType,
        key: this.client.currentIdentity.keyPair.publicKey.key,
      }),
      process: Process.create({
        process: this.client.process.process,
      }),
    });

    return this._createEvent(eventData);
  }

  async createBanner(banner: ImageManifest): Promise<SignedEvent> {
    const lwwElement = LWWElement.create({
      value: ImageManifest.toBinary(banner),
      unixMilliseconds: BigInt(Date.now()),
    });

    const eventData = EventCreationData.create({
      contentType: ContentType.BANNER,
      lwwElement,
      system: PublicKey.create({
        keyType: this.client.currentIdentity.keyPair.keyType,
        key: this.client.currentIdentity.keyPair.publicKey.key,
      }),
      process: Process.create({
        process: this.client.process.process,
      }),
    });

    return this._createEvent(eventData);
  }

  async createFollow(system: PublicKey): Promise<SignedEvent> {
    const systemBytes = PublicKey.toBinary(system);
    return this._createLWWElementSetEvent(
      ContentType.FOLLOW,
      systemBytes,
      LWWElementSet_Operation.ADD,
    );
  }

  async createUnfollow(system: PublicKey): Promise<SignedEvent> {
    const systemBytes = PublicKey.toBinary(system);
    return this._createLWWElementSetEvent(
      ContentType.FOLLOW,
      systemBytes,
      LWWElementSet_Operation.REMOVE,
    );
  }

  async createBlock(system: PublicKey): Promise<SignedEvent> {
    const systemBytes = PublicKey.toBinary(system);
    return this._createLWWElementSetEvent(
      ContentType.BLOCK,
      systemBytes,
      LWWElementSet_Operation.ADD,
    );
  }

  async createUnblock(system: PublicKey): Promise<SignedEvent> {
    const systemBytes = PublicKey.toBinary(system);
    return this._createLWWElementSetEvent(
      ContentType.BLOCK,
      systemBytes,
      LWWElementSet_Operation.REMOVE,
    );
  }

  async createAddServer(server: string): Promise<SignedEvent> {
    const serverBytes = new TextEncoder().encode(server);
    return this._createLWWElementSetEvent(
      ContentType.SERVER,
      serverBytes,
      LWWElementSet_Operation.ADD,
    );
  }

  async createRemoveServer(server: string): Promise<SignedEvent> {
    const serverBytes = new TextEncoder().encode(server);
    return this._createLWWElementSetEvent(
      ContentType.SERVER,
      serverBytes,
      LWWElementSet_Operation.REMOVE,
    );
  }

  async createAddAuthority(authority: string): Promise<SignedEvent> {
    const authorityBytes = new TextEncoder().encode(authority);
    return this._createLWWElementSetEvent(
      ContentType.AUTHORITY,
      authorityBytes,
      LWWElementSet_Operation.ADD,
    );
  }

  async createRemoveAuthority(authority: string): Promise<SignedEvent> {
    const authorityBytes = new TextEncoder().encode(authority);
    return this._createLWWElementSetEvent(
      ContentType.AUTHORITY,
      authorityBytes,
      LWWElementSet_Operation.REMOVE,
    );
  }

  async createJoinTopic(topic: string): Promise<SignedEvent> {
    const topicBytes = new TextEncoder().encode(topic);
    return this._createLWWElementSetEvent(
      ContentType.JOIN_TOPIC,
      topicBytes,
      LWWElementSet_Operation.ADD,
    );
  }

  async createLeaveTopic(topic: string): Promise<SignedEvent> {
    const topicBytes = new TextEncoder().encode(topic);
    return this._createLWWElementSetEvent(
      ContentType.JOIN_TOPIC,
      topicBytes,
      LWWElementSet_Operation.REMOVE,
    );
  }

  async deletePost(postPointer: Pointer): Promise<SignedEvent> {
    return this._createDelete(postPointer, ContentType.POST);
  }
}
