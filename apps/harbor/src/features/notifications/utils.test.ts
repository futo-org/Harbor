jest.mock('@polycentric/react-native', () =>
  jest.requireActual('@/test/polycentric'),
);

// The `polycentric-hooks` barrel imports the (native-heavy) provider. The
// decode path only needs two pure helpers, so delegate to `helpers` directly.
jest.mock('@/src/common/lib/polycentric-hooks', () => {
  const helpers = jest.requireActual(
    '@/src/common/lib/polycentric-hooks/helpers',
  );
  return {
    eventKeyId: helpers.eventKeyId,
    decodeV2PostBundle: helpers.decodePostBundle,
  };
});

// Pulled in via `decodeClaimBundle`'s module; evaluates query state from the
// native barrel at import time, which the decode path never touches.
jest.mock('@/src/common/query/hooks/useQuery', () => ({}));

// ESM-only package jest can't parse; the decode path only hashes schemas.
jest.mock('@noble/hashes/sha2.js', () => ({
  sha256: (bytes: Uint8Array) => bytes,
}));

import { v2 } from '@polycentric/react-native';
import { eventKeyId, type PostLabel } from '@/src/common/lib/polycentric-hooks';
import { decodeNotifications } from './utils';

const ACTOR = 'actoridentity';
const TARGET_IDENTITY = 'youridentity';

const SIGNED_BY = v2.PublicKey.create({
  keyType: v2.KeyType.Ed25519,
  key: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer,
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
      event,
      signature: new Uint8Array([0]).buffer,
    }),
    serializedContent: v2.SerializedContent.create({ content }),
  });
}

function postContent(
  text: string,
  extra?: { reply?: v2.EventKey; quote?: v2.EventKey },
): v2.Content {
  return v2.Content.create({
    contentBody: new v2.ContentBody.Post({
      post: v2.Post.create({
        text,
        reply: extra?.reply
          ? v2.PostReply.create({ parent: extra.reply })
          : undefined,
        quote: extra?.quote,
      }),
    }),
  });
}

function followContent(identity: string): v2.Content {
  return v2.Content.create({
    contentBody: new v2.ContentBody.Follow({
      follow: v2.Follow.create({ identity }),
    }),
  });
}

function reactionContent(eventKey: v2.EventKey, emoji?: string): v2.Content {
  return v2.Content.create({
    contentBody: new v2.ContentBody.Reaction({
      reaction: v2.Reaction.create({ eventKey, emoji, positive: true }),
    }),
  });
}

function repostContent(post: v2.EventKey): v2.Content {
  return v2.Content.create({
    contentBody: new v2.ContentBody.Repost({
      repost: v2.Repost.create({ post }),
    }),
  });
}

/** A verification claim (an X handle) made by `owner`. */
function claimBundle(owner: string): v2.EventBundle {
  const schema = v2.VerificationSchema.create({
    name: 'X Verification',
    fields: [
      v2.FieldDef.create({
        key: 'handle',
        kind: v2.FieldKind.String,
        description: 'Handle',
        format: '',
        required: true,
      }),
    ],
  });
  return makeBundle(
    owner,
    v2.Content.create({
      contentBody: new v2.ContentBody.VerificationClaim({
        verificationClaim: v2.VerificationClaim.create({
          schema: v2.SerializedVerificationSchema.create({ schema }),
          fields: new Map([
            ['handle', new TextEncoder().encode('@mark').buffer],
          ]),
        }),
      }),
    }),
    3,
  );
}

function verificationTargetContent(
  claimEventKey: v2.EventKey | undefined,
  targetIdentities: string[],
): v2.Content {
  return v2.Content.create({
    contentBody: new v2.ContentBody.VerificationTarget({
      verificationTarget: v2.VerificationTarget.create({
        claimEventKey,
        targetIdentities,
      }),
    }),
  });
}

/** The recipient's post that an action targets. */
const TARGET_KEY = makeEventKey(TARGET_IDENTITY, 5);
const targetBundle = makeBundle(
  TARGET_IDENTITY,
  postContent('your original post'),
  5,
);

/** Build a label map for a single labeled post. */
function labelsFor(key: v2.EventKey): Map<string, PostLabel[]> {
  const labelMap = new Map<string, PostLabel[]>();
  labelMap.set(eventKeyId(key), [{ value: 'self-harm', labeledBy: ACTOR }]);
  return labelMap;
}

function decodeOne(
  notification: v2.Notification,
  labels?: Map<string, PostLabel[]>,
) {
  const response = v2.ListNotificationsResponse.create({
    notifications: [notification],
  });
  return decodeNotifications(response, labels ?? new Map());
}

describe('decodeNotifications', () => {
  it('decodes a follow (actor, no post)', () => {
    const items = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(ACTOR, followContent(TARGET_IDENTITY)),
        kind: v2.NotificationKind.Follow,
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
        kind: v2.NotificationKind.Reply,
      }),
    );
    expect(item.kind).toBe('reply');
    if (item.kind === 'reply') {
      expect(item.reply.content).toBe('my reply');
      expect(item.targetPost?.content).toBe('your original post');
    }
  });

  it('decodes a mention with the mentioning post', () => {
    const [item] = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(ACTOR, postContent('hey you')),
        kind: v2.NotificationKind.Mention,
      }),
    );
    expect(item.kind).toBe('mention');
    if (item.kind === 'mention') {
      expect(item.mentioningPost.content).toBe('hey you');
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
        kind: v2.NotificationKind.Quote,
      }),
    );
    expect(item.kind).toBe('quote');
    if (item.kind === 'quote') {
      expect(item.quote.content).toBe('quoting you');
      expect(item.targetPost?.content).toBe('your original post');
    }
  });

  it('attaches labels to the trigger post of a reply', () => {
    const [item] = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(
          ACTOR,
          postContent('my reply', { reply: TARGET_KEY }),
        ),
        targetEvent: targetBundle,
        kind: v2.NotificationKind.Reply,
      }),
      labelsFor(makeEventKey(ACTOR)),
    );
    expect(item.kind).toBe('reply');
    if (item.kind === 'reply') {
      expect(item.reply.labels).toEqual([
        { value: 'self-harm', labeledBy: ACTOR },
      ]);
      expect(item.targetPost?.labels).toBeUndefined();
    }
  });

  it('attaches labels to the trigger post of a quote', () => {
    const [item] = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(
          ACTOR,
          postContent('quoting you', { quote: TARGET_KEY }),
        ),
        targetEvent: targetBundle,
        kind: v2.NotificationKind.Quote,
      }),
      labelsFor(makeEventKey(ACTOR)),
    );
    expect(item.kind).toBe('quote');
    if (item.kind === 'quote') {
      expect(item.quote.labels).toEqual([
        { value: 'self-harm', labeledBy: ACTOR },
      ]);
      expect(item.targetPost?.labels).toBeUndefined();
    }
  });

  it('decodes a reaction with its emoji and the targeted post', () => {
    const [item] = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(ACTOR, reactionContent(TARGET_KEY, '👍')),
        targetEvent: targetBundle,
        kind: v2.NotificationKind.Reaction,
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
        kind: v2.NotificationKind.Repost,
      }),
    );
    expect(item.kind).toBe('repost');
    if (item.kind === 'repost') {
      expect(item.targetPost?.content).toBe('your original post');
    }
  });

  it('decodes a verification request with its claim key', () => {
    const claimKey = makeEventKey(ACTOR, 3);
    const [item] = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(
          ACTOR,
          verificationTargetContent(claimKey, [TARGET_IDENTITY]),
        ),
        kind: v2.NotificationKind.VerificationRequest,
      }),
    );
    expect(item.kind).toBe('verificationRequest');
    if (item.kind === 'verificationRequest') {
      expect(item.fromIdentity).toBe(ACTOR);
      expect(item.claimKey).toEqual(claimKey);
    }
  });

  it('decodes a completed verification with its claim key and claim', () => {
    const claimKey = makeEventKey(TARGET_IDENTITY, 3);
    const [item] = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(
          ACTOR,
          v2.Content.create({
            contentBody: new v2.ContentBody.VerificationVerify({
              verificationVerify: v2.VerificationVerify.create({
                claimEventKey: claimKey,
              }),
            }),
          }),
        ),
        targetEvent: claimBundle(TARGET_IDENTITY),
        kind: v2.NotificationKind.VerificationComplete,
      }),
    );
    expect(item.kind).toBe('verificationComplete');
    if (item.kind === 'verificationComplete') {
      expect(item.fromIdentity).toBe(ACTOR);
      expect(item.claimKey).toEqual(claimKey);
      expect(item.claim?.schemaName).toBe('X Verification');
      expect(item.claim?.identity).toBe(TARGET_IDENTITY);
    }
  });

  it('decodes a verification request with the claim it targets', () => {
    const claimKey = makeEventKey(ACTOR, 3);
    const [item] = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(
          ACTOR,
          verificationTargetContent(claimKey, [TARGET_IDENTITY]),
        ),
        targetEvent: claimBundle(ACTOR),
        kind: v2.NotificationKind.VerificationRequest,
      }),
    );
    expect(item.kind).toBe('verificationRequest');
    if (item.kind === 'verificationRequest') {
      expect(item.claim?.schemaName).toBe('X Verification');
      expect(item.claim?.identity).toBe(ACTOR);
      expect(item.claim?.fields).toEqual([
        { key: 'handle', label: 'Handle', value: '@mark' },
      ]);
    }
  });

  it('decodes a verification request without a claim key', () => {
    const [item] = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(
          ACTOR,
          verificationTargetContent(undefined, [TARGET_IDENTITY]),
        ),
        kind: v2.NotificationKind.VerificationRequest,
      }),
    );
    expect(item.kind).toBe('verificationRequest');
    if (item.kind === 'verificationRequest') {
      expect(item.claimKey).toBeUndefined();
    }
  });

  it('drops a notification without a trigger event', () => {
    const items = decodeOne(
      v2.Notification.create({ kind: v2.NotificationKind.Follow }),
    );
    expect(items).toHaveLength(0);
  });

  it("drops a reply whose trigger isn't a post", () => {
    const items = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(ACTOR, followContent(TARGET_IDENTITY)),
        kind: v2.NotificationKind.Reply,
      }),
    );
    expect(items).toHaveLength(0);
  });

  it('drops an unknown kind', () => {
    const items = decodeOne(
      v2.Notification.create({
        triggerEvent: makeBundle(ACTOR, followContent(TARGET_IDENTITY)),
        kind: v2.NotificationKind.Unspecified,
      }),
    );
    expect(items).toHaveLength(0);
  });
});
