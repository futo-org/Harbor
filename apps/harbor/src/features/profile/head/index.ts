import { APP_NAME } from '@/src/common/constants';
import type { HeadImage } from '@/src/common/lib/head/content';
import { type Head, plural, toDescription } from '@/src/common/lib/head';
import { truncateText } from '@/src/common/util/truncateText';

/** A profile, as document heads name it: on its own screens and on its content's */
export type Author = {
  identity: string;
  name: string;
  /** Verified alias, or the short identity key */
  handle: string;
  /** Profile path, by alias if there is one */
  path: string;
  description: string;
  avatar: HeadImage | null;
  followersCount: number;
  followingCount: number;
  /** Has a moderation label: not to be shown in previews */
  sensitive: boolean;
};

export type ProfileView = {
  /** Leads the title of a sub-screen, e.g. "Followers" */
  label?: string;
  /** Path after the profile's, e.g. "/followers" */
  subPath?: string;
  /** Sub-screens that aren't worth a search result point at the profile */
  noindex?: boolean;
};

export function profileHead(author: Author, view: ProfileView): Head {
  const named = `${truncateText(author.name, 30)} (${author.handle})`;
  const stats = `${plural(author.followersCount, 'follower')}, ${author.followingCount} following`;
  const bio = author.sensitive ? '' : toDescription(author.description);

  return {
    title: view.label ? `${view.label} - ${named}` : named,
    description: bio
      ? `${bio} · ${stats}`
      : `${author.name} is on ${APP_NAME}. ${stats}.`,
    path: view.noindex ? author.path : author.path + (view.subPath ?? ''),
    type: 'profile',
    image: author.sensitive ? null : author.avatar,
    imageAlt: `${author.name}'s avatar`,
    noindex: view.noindex || author.sensitive,
  };
}

export const PROFILE_VIEWS = {
  profile: {},
  // The photo viewer and identity sheet open over the profile
  photo: { noindex: true },
  identity: { noindex: true },
  followers: { label: 'Followers', noindex: true },
  following: { label: 'Following', noindex: true },
  verificationClaims: {
    label: 'Verifications',
    subPath: '/verifications/claims',
  },
  verificationVerifies: { label: 'Verifies', noindex: true },
} satisfies Record<string, ProfileView>;
