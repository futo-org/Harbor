import {
  eventKeyId,
  decodeV2PostBundle,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import { decodeBundle } from '@/src/common/lib/polycentric-hooks/helpers';
import {
  decodeClaimBundle,
  type DecodedClaim,
} from '@/src/features/verifications/hooks/useClaimById';
import { v2 } from '@polycentric/react-native';

/** Fields common to every notification. */
type NotificationBase = {
  /** Stable list key — hex of the trigger event's key. */
  id: string;
  /** Identity that triggered the notification (the actor). */
  fromIdentity: string;
  /** When the triggering event was created (ms since epoch). */
  createdAt: number;
};

/** Someone followed you. */
export type FollowNotification = NotificationBase & {
  kind: 'follow';
};

/** Someone replied to your post. */
export type ReplyNotification = NotificationBase & {
  kind: 'reply';
  /** The reply post (its text plus key, for navigation). */
  reply: PostData;
  /** Your post that was replied to, when it could be resolved. */
  targetPost?: PostData;
};

/** Someone reposted your post. */
export type RepostNotification = NotificationBase & {
  kind: 'repost';
  /** Your post that was reposted, when it could be resolved. */
  targetPost?: PostData;
};

/** Someone reacted to your post. */
export type ReactionNotification = NotificationBase & {
  kind: 'reaction';
  /** The reaction emoji, when one was provided. */
  emoji?: string;
  /** Your post that was reacted to, when it could be resolved. */
  targetPost?: PostData;
};

/** Someone quoted your post. */
export type QuoteNotification = NotificationBase & {
  kind: 'quote';
  /** The post that quoted yours (its text plus key, for navigation). */
  quote: PostData;
  /** Your post that was quoted, when it could be resolved. */
  targetPost?: PostData;
};

/** Someone requested you verify a claim of theirs. */
export type VerificationRequestNotification = NotificationBase & {
  kind: 'verificationRequest';
  /** Key of the claim to verify (for navigation), when it was carried. */
  claimKey?: v2.EventKey;
  /** The claim itself, when the notification carried its event — rendered
   *  as the same card the verifications inbox shows. */
  claim?: DecodedClaim;
};

/** Someone completed a verification you requested. */
export type VerificationCompleteNotification = NotificationBase & {
  kind: 'verificationComplete';
  /** Key of the verified claim (for navigation), when it was carried. */
  claimKey?: v2.EventKey;
  /** The verified claim, when the notification carried its event. */
  claim?: DecodedClaim;
};

export type NotificationData =
  | FollowNotification
  | ReplyNotification
  | RepostNotification
  | ReactionNotification
  | QuoteNotification
  | VerificationRequestNotification
  | VerificationCompleteNotification;

/** The author identity, a stable hex id, and creation time from a bundle's
 *  event key. `null` when the bundle is missing or unparseable. */
function triggerInfo(
  bundle: v2.EventBundle | undefined,
): { id: string; identity: string; createdAt: number } | null {
  if (!bundle?.signedEvent) return null;
  try {
    const event = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
    const key = event.key;
    if (!key) return null;
    return {
      id: eventKeyId(key),
      identity: key.identity,
      createdAt: Number(event.createdAt ?? 0),
    };
  } catch {
    return null;
  }
}

/** Map a single protobuf `Notification` to its tagged variant, or `null`
 *  when it is unparseable or of an unknown type. */
function decodeNotification(
  notification: v2.Notification,
): NotificationData | null {
  const trigger = triggerInfo(notification.triggerEvent);
  if (!trigger) return null;

  const base: NotificationBase = {
    id: trigger.id,
    fromIdentity: trigger.identity,
    createdAt: trigger.createdAt,
  };

  // The post the action was taken against (your post). Follows have none.
  const targetPost = notification.targetEvent
    ? (decodeV2PostBundle(notification.targetEvent) ?? undefined)
    : undefined;

  switch (notification.kind) {
    case v2.NotificationKind.FOLLOW:
      return { ...base, kind: 'follow' };

    case v2.NotificationKind.REPLY: {
      // The reply itself is the trigger event; drop it if it won't decode.
      const reply = notification.triggerEvent
        ? decodeV2PostBundle(notification.triggerEvent)
        : null;
      if (!reply) return null;
      return { ...base, kind: 'reply', reply, targetPost };
    }

    case v2.NotificationKind.REPOST:
      return { ...base, kind: 'repost', targetPost };

    case v2.NotificationKind.QUOTE: {
      // The quoting post is the trigger event; drop it if it won't decode.
      const quote = notification.triggerEvent
        ? decodeV2PostBundle(notification.triggerEvent)
        : null;
      if (!quote) return null;
      return { ...base, kind: 'quote', quote, targetPost };
    }

    case v2.NotificationKind.REACTION: {
      const reaction = notification.triggerEvent
        ? decodeBundle(notification.triggerEvent, 'reaction')
        : null;
      return {
        ...base,
        kind: 'reaction',
        emoji: reaction?.content.emoji || undefined,
        targetPost,
      };
    }

    case v2.NotificationKind.VERIFICATION_REQUEST: {
      // The claim key travels in the trigger's VerificationTarget content;
      // the claim event itself is the notification's target.
      const target = notification.triggerEvent
        ? decodeBundle(notification.triggerEvent, 'verificationTarget')
        : null;
      const claim = notification.targetEvent
        ? (decodeClaimBundle(notification.targetEvent) ?? undefined)
        : undefined;
      return {
        ...base,
        kind: 'verificationRequest',
        claimKey: target?.content.claimEventKey,
        claim,
      };
    }

    case v2.NotificationKind.VERIFICATION_COMPLETE: {
      // The claim key travels in the trigger's VerificationVerify content;
      // the claim event itself is the notification's target.
      const verify = notification.triggerEvent
        ? decodeBundle(notification.triggerEvent, 'verificationVerify')
        : null;
      const claim = notification.targetEvent
        ? (decodeClaimBundle(notification.targetEvent) ?? undefined)
        : undefined;
      return {
        ...base,
        kind: 'verificationComplete',
        claimKey: verify?.content.claimEventKey,
        claim,
      };
    }

    default:
      return null;
  }
}

/** Decode a `ListNotificationsResponse` into renderable notifications. */
export function decodeNotifications(
  response: v2.ListNotificationsResponse,
): NotificationData[] {
  const items: NotificationData[] = [];
  for (const notification of response.notifications) {
    const decoded = decodeNotification(notification);
    if (decoded) items.push(decoded);
  }

  return items;
}
