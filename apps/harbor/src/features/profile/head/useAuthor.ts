import {
  hasModerationLabelValue,
  toHeadImage,
} from '@/src/common/lib/head/content';
import type { Author } from './index';
import { useIdentityHandle } from '@/src/features/profile/hooks/useIdentityHandle';
import { useProfile } from '@/src/features/profile/hooks/useProfile';

/**
 * The profile as the document head names it, from what the client has loaded.
 * The client's `loadAuthor`. Null until the profile and its handle are known.
 */
export function useAuthor(identity: string | null | undefined): Author | null {
  const profile = useProfile(identity);
  const handle = useIdentityHandle(identity);

  if (!identity || handle.kind === 'loading') return null;
  // Whether the alias holds decides the handle and the path
  if (handle.kind === 'alias-pending') return null;

  return {
    identity,
    name: profile.name || handle.text,
    handle: handle.text,
    path: `/${handle.kind === 'alias' ? handle.text : identity}`,
    description: profile.description ?? '',
    avatar: toHeadImage(profile.avatar ?? undefined),
    followersCount: profile.followersCount,
    followingCount: profile.followingCount,
    sensitive: hasModerationLabelValue(
      profile.labels.map((label) => label.value),
    ),
  };
}
