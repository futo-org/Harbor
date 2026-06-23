// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest. We only need the pure `v2` protobuf-ts
// namespace, so expose just that (sourced from js-core's generated protos).
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../packages/js-core/src/proto/v2'),
}));

// The `polycentric-hooks` barrel imports the (native-heavy) provider. The
// decode path only needs two pure helpers, so delegate to `helpers` directly.
jest.mock('@/src/common/lib/polycentric-hooks', () => {
  const helpers = jest.requireActual(
    '@/src/common/lib/polycentric-hooks/helpers',
  );
  return {
    bytesToHex: helpers.bytesToHex,
    decodeV2PostBundle: helpers.decodePostBundle,
  };
});

import { v2 } from '@polycentric/react-native';
import { decodeNotifications } from './utils';

const ACTOR = 'actoridentity';
const TARGET_IDENTITY = 'youridentity';

const SIGNED_BY = v2.PublicKey.create({
  keyType: 1,
  key: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
});

function makeEventKey(identity: string, sequence = 1): v2.EventKey {
  return v2.EventKey.create({
    collection: 2,
    identity,
    signedBy: SIGNED_BY,
    sequence: BigInt(sequence),
  });
}

function makeBundle(
  identity: string,
  content: v2.Content,
  sequence = 1,
): v2.EventBundle {
  const event = v2.Event.create({
    key: makeEventKey(identity, sequence),
    createdAt: 1000n,
  });
  return v2.EventBundle.create({
    signedEvent: v2.SignedEvent.create({
      eventBytes: v2.Event.toBinary(event),
      signature: new Uint8Array([0]),
    }),
    serializedContent: v2.SerializedContent.create({
      contentBytes: v2.Content.toBinary(content),
    }),
  });
}

function postContent(
  text: string,
  extra?: { reply?: v2.EventKey; quote?: v2.EventKey },
): v2.Content {
  return v2.Content.create({
    contentBody: {
      oneofKind: 'post',
      post: v2.Post.create({
        text,
        reply: extra?.reply
          ? v2.PostReply.create({ parent: extra.reply })
          : undefined,
        quote: extra?.quote,
      }),
    },
  });
}

function followContent(identity: string): v2.Content {
  return v2.Content.create({
    contentBody: {
      oneofKind: 'follow',
      follow: v2.Follow.create({ identity }),
    },
  });
}

function reactionContent(eventKey: v2.EventKey, emoji?: string): v2.Content {
  return v2.Content.create({
    contentBody: {
      oneofKind: 'reaction',
      reaction: v2.Reaction.create({ eventKey, emoji, positive: true }),
    },
  });
}

function repostContent(post: v2.EventKey): v2.Content {
  return v2.Content.create({
    contentBody: { oneofKind: 'repost', repost: v2.Repost.create({ post }) },
  });
}

/** The recipient's post that an action targets. */
const TARGET_KEY = makeEventKey(TARGET_IDENTITY, 5);
const targetBundle = makeBundle(
  TARGET_IDENTITY,
  postContent('your original post'),
  5,
);

function decodeOne(notification: v2.Notification) {
  const response = v2.ListNotificationsResponse.create({
    notifications: [notification],
  });
  return decodeNotifications(response);
}

describe('decodeNotifications', () => {
  it('decodes a follow (actor, no post)', () => {
    const items = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(ACTOR, followContent(TARGET_IDENTITY)),
        kind: v2.NotificationKind.FOLLOW,
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('follow');
    expect(items[0].fromIdentity).toBe(ACTOR);
  });

  it('decodes a reply with its post and the targeted post', () => {
    const [item] = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(
          ACTOR,
          postContent('my reply', { reply: TARGET_KEY }),
        ),
        targetEvent: targetBundle,
        kind: v2.NotificationKind.REPLY,
      }),
    );
    expect(item.kind).toBe('reply');
    if (item.kind === 'reply') {
      expect(item.reply.content).toBe('my reply');
      expect(item.targetPost?.content).toBe('your original post');
    }
  });

  it('decodes a quote with its post and the quoted post', () => {
    const [item] = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(
          ACTOR,
          postContent('quoting you', { quote: TARGET_KEY }),
        ),
        targetEvent: targetBundle,
        kind: v2.NotificationKind.QUOTE,
      }),
    );
    expect(item.kind).toBe('quote');
    if (item.kind === 'quote') {
      expect(item.quote.content).toBe('quoting you');
      expect(item.targetPost?.content).toBe('your original post');
    }
  });

  it('decodes a reaction with its emoji and the targeted post', () => {
    const [item] = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(ACTOR, reactionContent(TARGET_KEY, '👍')),
        targetEvent: targetBundle,
        kind: v2.NotificationKind.REACTION,
      }),
    );
    expect(item.kind).toBe('reaction');
    if (item.kind === 'reaction') {
      expect(item.emoji).toBe('👍');
      expect(item.targetPost?.content).toBe('your original post');
    }
  });

  it('decodes a repost with the targeted post', () => {
    const [item] = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(ACTOR, repostContent(TARGET_KEY)),
        targetEvent: targetBundle,
        kind: v2.NotificationKind.REPOST,
      }),
    );
    expect(item.kind).toBe('repost');
    if (item.kind === 'repost') {
      expect(item.targetPost?.content).toBe('your original post');
    }
  });

  it('drops a notification without a trigger event', () => {
    const items = decodeOne(
      v2.Notification.create({ kind: v2.NotificationKind.FOLLOW }),
    );
    expect(items).toHaveLength(0);
  });

  it("drops a reply whose trigger isn't a post", () => {
    const items = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(ACTOR, followContent(TARGET_IDENTITY)),
        kind: v2.NotificationKind.REPLY,
      }),
    );
    expect(items).toHaveLength(0);
  });

  it('drops an unknown kind', () => {
    const items = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(ACTOR, followContent(TARGET_IDENTITY)),
        kind: v2.NotificationKind.UNSPECIFIED,
      }),
    );
    expect(items).toHaveLength(0);
  });
});
