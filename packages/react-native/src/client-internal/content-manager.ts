import type { PolycentricClient } from '../polycentric-client';
import { polycentric as proto } from '../generated/protocol';

export class ContentManager {
  constructor(private readonly client: PolycentricClient) {}

  private _system(): proto.IPublicKey {
    return this.client.currentKeyPair.publicKey;
  }

  private _process(): proto.IProcess {
    return this.client.process;
  }

  private async _createLWWElementSetEvent(
    contentType: proto.ContentType,
    value: Uint8Array,
    operation: proto.LWWElementSet.Operation
  ): Promise<proto.SignedEvent> {
    const lwwElementSet = proto.LWWElementSet.create({
      operation,
      value,
      unixMilliseconds: Date.now(),
    });

    const eventData = proto.EventCreationData.create({
      contentType,
      lwwElementSet,
      system: this._system(),
      process: this._process(),
    });

    return this._createEvent(eventData);
  }

  private async _createOpinion(
    opinion: proto.Opinion,
    subjectPointer: proto.IPointer
  ): Promise<proto.SignedEvent> {
    const subjectReference = proto.Reference.create({
      referenceType: 2, // TODO: Create Proto ReferenceType enum, reference type of 2 is a Pointer
      reference: proto.Pointer.encode(subjectPointer).finish(),
    });

    const lwwElement = proto.LWWElement.create({
      value: new Uint8Array([opinion]),
      unixMilliseconds: Date.now(),
    });

    const eventData = proto.EventCreationData.create({
      contentType: proto.ContentType.OPINION,
      lwwElement,
      references: [subjectReference],
      system: this._system(),
      process: this._process(),
    });

    return this._createEvent(eventData);
  }

  private async _createDelete(
    targetPointer: proto.IPointer,
    contentType: proto.ContentType
  ): Promise<proto.SignedEvent> {
    const deleteEvent = proto.Delete.create({
      process: targetPointer.process,
      logicalClock: targetPointer.logicalClock,
      unixMilliseconds: Date.now(),
      indices: proto.Indices.create({}),
      contentType,
    });

    const eventData = proto.EventCreationData.create({
      contentType: proto.ContentType.DELETE,
      content: proto.Delete.encode(deleteEvent).finish(),
      references: [
        proto.Reference.create({
          referenceType: 2,
          reference: proto.Pointer.encode(targetPointer).finish(),
        }),
      ],
      system: this._system(),
      process: this._process(),
    });

    return this._createEvent(eventData);
  }

  async _createEvent(
    eventData: proto.EventCreationData
  ): Promise<proto.SignedEvent> {
    if (!this.client.hasIdentity()) {
      const error = new Error(
        'Cannot create events without an active identity'
      );
      this.client.events.emitError(error);
      throw error;
    }

    eventData.logicalClock = this.client.nextLogicalClock();
    eventData.unixMilliseconds = Date.now();

    // createEvent returns raw unsigned Event bytes for signing
    const eventBytes = this.client.ffiBridge.createEvent(eventData, Date.now());

    // Sign the event bytes via CryptoManager
    const signature = await this.client.cryptoManager.sign(
      this.client.currentKeyPair.privateKey.key,
      eventBytes,
      this.client.currentKeyPair.keyType
    );

    // Wrap in SignedEvent protobuf
    const signedEvent = proto.SignedEvent.create({
      signature,
      event: eventBytes,
    });

    // Ingest into the Rust core's local store
    this.client.ffiBridge.ingestEvent(signedEvent);

    // Persist event to local database
    if (this.client.storage) {
      this.client.storage.events.persistEvent(signedEvent);
    }

    this.client.events.emitContentCreated(signedEvent);

    return signedEvent;
  }

  async createPost(
    content: string,
    image?: proto.IImageManifest,
    reference?: proto.IReference
  ): Promise<proto.SignedEvent> {
    const post = proto.Post.create({ content, image });

    const eventData = proto.EventCreationData.create({
      contentType: proto.ContentType.POST,
      content: proto.Post.encode(post).finish(),
      references: reference ? [reference] : [],
      system: this._system(),
      process: this._process(),
    });

    return this._createEvent(eventData);
  }

  async createLike(subjectPointer: proto.IPointer): Promise<proto.SignedEvent> {
    return this._createOpinion(proto.Opinion.LIKE, subjectPointer);
  }

  async createDislike(
    subjectPointer: proto.IPointer
  ): Promise<proto.SignedEvent> {
    return this._createOpinion(proto.Opinion.DISLIKE, subjectPointer);
  }

  async createNeutral(
    subjectPointer: proto.IPointer
  ): Promise<proto.SignedEvent> {
    return this._createOpinion(proto.Opinion.NEUTRAL, subjectPointer);
  }

  async createUsername(username: string): Promise<proto.SignedEvent> {
    const lwwElement = proto.LWWElement.create({
      value: new TextEncoder().encode(username),
      unixMilliseconds: Date.now(),
    });

    const eventData = proto.EventCreationData.create({
      contentType: proto.ContentType.USERNAME,
      lwwElement,
      system: this._system(),
      process: this._process(),
    });

    return this._createEvent(eventData);
  }

  async createDescription(description: string): Promise<proto.SignedEvent> {
    const lwwElement = proto.LWWElement.create({
      value: new TextEncoder().encode(description),
      unixMilliseconds: Date.now(),
    });

    const eventData = proto.EventCreationData.create({
      contentType: proto.ContentType.DESCRIPTION,
      lwwElement,
      system: this._system(),
      process: this._process(),
    });

    return this._createEvent(eventData);
  }

  async createAvatar(avatar: proto.IImageManifest): Promise<proto.SignedEvent> {
    const lwwElement = proto.LWWElement.create({
      value: proto.ImageManifest.encode(avatar).finish(),
      unixMilliseconds: Date.now(),
    });

    const eventData = proto.EventCreationData.create({
      contentType: proto.ContentType.AVATAR,
      lwwElement,
      system: this._system(),
      process: this._process(),
    });

    return this._createEvent(eventData);
  }

  async createBanner(banner: proto.IImageManifest): Promise<proto.SignedEvent> {
    const lwwElement = proto.LWWElement.create({
      value: proto.ImageManifest.encode(banner).finish(),
      unixMilliseconds: Date.now(),
    });

    const eventData = proto.EventCreationData.create({
      contentType: proto.ContentType.BANNER,
      lwwElement,
      system: this._system(),
      process: this._process(),
    });

    return this._createEvent(eventData);
  }

  async createFollow(system: proto.IPublicKey): Promise<proto.SignedEvent> {
    const systemBytes = proto.PublicKey.encode(system).finish();
    return this._createLWWElementSetEvent(
      proto.ContentType.FOLLOW,
      systemBytes,
      proto.LWWElementSet.Operation.ADD
    );
  }

  async createUnfollow(system: proto.IPublicKey): Promise<proto.SignedEvent> {
    const systemBytes = proto.PublicKey.encode(system).finish();
    return this._createLWWElementSetEvent(
      proto.ContentType.FOLLOW,
      systemBytes,
      proto.LWWElementSet.Operation.REMOVE
    );
  }

  async createBlock(system: proto.IPublicKey): Promise<proto.SignedEvent> {
    const systemBytes = proto.PublicKey.encode(system).finish();
    return this._createLWWElementSetEvent(
      proto.ContentType.BLOCK,
      systemBytes,
      proto.LWWElementSet.Operation.ADD
    );
  }

  async createUnblock(system: proto.IPublicKey): Promise<proto.SignedEvent> {
    const systemBytes = proto.PublicKey.encode(system).finish();
    return this._createLWWElementSetEvent(
      proto.ContentType.BLOCK,
      systemBytes,
      proto.LWWElementSet.Operation.REMOVE
    );
  }

  async createAddServer(server: string): Promise<proto.SignedEvent> {
    const serverBytes = new TextEncoder().encode(server);
    return this._createLWWElementSetEvent(
      proto.ContentType.SERVER,
      serverBytes,
      proto.LWWElementSet.Operation.ADD
    );
  }

  async createRemoveServer(server: string): Promise<proto.SignedEvent> {
    const serverBytes = new TextEncoder().encode(server);
    return this._createLWWElementSetEvent(
      proto.ContentType.SERVER,
      serverBytes,
      proto.LWWElementSet.Operation.REMOVE
    );
  }

  async createAddAuthority(authority: string): Promise<proto.SignedEvent> {
    const authorityBytes = new TextEncoder().encode(authority);
    return this._createLWWElementSetEvent(
      proto.ContentType.AUTHORITY,
      authorityBytes,
      proto.LWWElementSet.Operation.ADD
    );
  }

  async createRemoveAuthority(authority: string): Promise<proto.SignedEvent> {
    const authorityBytes = new TextEncoder().encode(authority);
    return this._createLWWElementSetEvent(
      proto.ContentType.AUTHORITY,
      authorityBytes,
      proto.LWWElementSet.Operation.REMOVE
    );
  }

  async createJoinTopic(topic: string): Promise<proto.SignedEvent> {
    const topicBytes = new TextEncoder().encode(topic);
    return this._createLWWElementSetEvent(
      proto.ContentType.JOIN_TOPIC,
      topicBytes,
      proto.LWWElementSet.Operation.ADD
    );
  }

  async createLeaveTopic(topic: string): Promise<proto.SignedEvent> {
    const topicBytes = new TextEncoder().encode(topic);
    return this._createLWWElementSetEvent(
      proto.ContentType.JOIN_TOPIC,
      topicBytes,
      proto.LWWElementSet.Operation.REMOVE
    );
  }

  async setOpinion(
    pointer: proto.IPointer,
    opinion: proto.Opinion
  ): Promise<proto.SignedEvent> {
    return this._createOpinion(opinion, pointer);
  }

  async deletePost(postPointer: proto.IPointer): Promise<proto.SignedEvent> {
    return this._createDelete(postPointer, proto.ContentType.POST);
  }
}
