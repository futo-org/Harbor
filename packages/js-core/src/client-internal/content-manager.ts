import { sha256 } from '@noble/hashes/sha2';
import { COLLECTION } from '../constants';
import { PolycentricClient } from '../polycentric-client';
import * as Proto from '../proto/v2';

export class ContentManager {
  constructor(private readonly client: PolycentricClient) {}

  /**
   * Helper function to build content
   */
  build(contentBody: Proto.Content['contentBody']): Proto.Content {
    return Proto.Content.create({ contentBody });
  }

  /**
   * Builds ContentDigest from a provided Content
   */
  buildDigest(content: Proto.Content) {
    const contentBytes = Proto.Content.toBinary(content);

    return Proto.ContentDigest.create({
      type: Proto.ContentDigestType.SHA256,
      value: sha256(contentBytes),
    });
  }

  /**
   * Saves the content to the local client store
   */
  async save(content: Proto.Content): Promise<void> {
    const digest = this.buildDigest(content);
    await this.client.storage.content.save(digest, content);
  }

  /**
   * Compose, sign, and locally commit a Post event. `images` are
   * already-uploaded `ImageSet`s (see `processAndUploadImage`). Does
   * not sync. The caller decides when to push.
   */
  async commitPost(args: {
    text: string;
    images?: Proto.ImageSet[];
    reply?: Proto.PostReply;
    quote?: Proto.EventKey;
  }): Promise<Proto.EventBundle> {
    const content = this.build({
      oneofKind: 'post',
      post: {
        text: args.text,
        images: args.images ?? [],
        reply: args.reply,
        quote: args.quote,
      },
    });
    await this.save(content);
    const event = await this.client.buildEvent(content);
    const signedEvent = await this.client.signEvent(event);
    // `commitEvent` persists the event locally and, when content is
    // passed, seeds the core's content store + emits contentCreated
    // with both signedEvent and content so feeds can decode directly.
    await this.client.commitEvent(signedEvent, content);
    return Proto.EventBundle.create({
      signedEvent,
      serializedContent: { contentBytes: Proto.Content.toBinary(content) },
    });
  }

  /**
   * Compose, sign, and locally commit a ProfileUpdate event. `avatar`
   * and `banner` are already-uploaded `ImageSet`s (see
   * `processAndUploadImage`). Does not sync. The caller decides when
   * to push.
   */
  async commitProfileUpdate(args: {
    name: string;
    description: string;
    avatar?: Proto.ImageSet;
    banner?: Proto.ImageSet;
  }): Promise<Proto.SignedEvent> {
    const content = this.build({
      oneofKind: 'profileUpdate',
      profileUpdate: {
        name: args.name,
        description: args.description,
        avatar: args.avatar,
        banner: args.banner,
      },
    });
    await this.save(content);
    const event = await this.client.buildEvent(content, COLLECTION.PROFILE);
    const signedEvent = await this.client.signEvent(event);
    await this.client.commitEvent(signedEvent, content);
    return signedEvent;
  }

  /**
   * Download any blobs that we don't have locally from this content.
   * This is used so that blobs of an identity will eventually
   * persist on other devices in that identity.
   */
  async backfillBlobsForContent(content: Proto.Content): Promise<void> {
    const digests = this.collectBlobDigests(content);
    if (digests.length === 0) return;

    await Promise.all(
      digests.map(async (digest) => {
        try {
          if (await this.client.fileStoreDriver.has(digest)) return;
          const bytes = await this.client.fetchBlobBytes(digest);
          if (!bytes) return;
          await this.client.fileStoreDriver.put(digest, bytes);
        } catch (err) {
          console.warn('backfillBlobsForContent failed:', err);
        }
      }),
    );
  }

  /**
   * Collect all blob digests referenced in a post or profile update
   */
  private collectBlobDigests(content: Proto.Content): Proto.ContentDigest[] {
    const out: Proto.ContentDigest[] = [];
    const pushSet = (set?: Proto.ImageSet) => {
      if (!set) return;
      for (const img of set.images) {
        if (img.blob?.digest) out.push(img.blob.digest);
      }
    };
    const body = content.contentBody;
    if (body.oneofKind === 'post') {
      for (const set of body.post.images) pushSet(set);
    } else if (body.oneofKind === 'profileUpdate') {
      pushSet(body.profileUpdate.avatar);
      pushSet(body.profileUpdate.banner);
    }
    return out;
  }
}
