import { APP_NAME } from '@/src/common/constants';
import { cached } from '@/src/common/lib/page-metadata/cached';
import {
  type Page,
  plural,
  toDescription,
  toMetadata,
  unavailablePage,
} from '@/src/common/lib/page-metadata/page';
import { routeParam } from '@/src/common/lib/page-metadata/route-param';
import { truncateText } from '@/src/common/util/truncateText';
import type { GenerateMetadataFunction } from 'expo-router/server';
import { type Author, loadAuthor } from './lib/load-author';

export type ProfileView = {
  /** Leads the title of a sub-screen, e.g. "Followers" */
  label?: string;
  /** Path after the profile's, e.g. "/followers" */
  subPath?: string;
  /** Sub-screens that aren't worth a search result point at the profile */
  noindex?: boolean;
};

export function profilePage(author: Author, view: ProfileView): Page {
  // As `ProfileScreen` titles it
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

/** A profile, or one of its sub-screens */
function createProfileMetadata(view: ProfileView): GenerateMetadataFunction {
  return async (_request, params) => {
    const identityId = routeParam(params, 'identityId');
    const author = await cached(`profile:${identityId}`, (signal) =>
      loadAuthor(identityId, signal),
    );

    return toMetadata(
      author
        ? profilePage(author, view)
        : unavailablePage('Profile', `/${identityId}`),
    );
  };
}

export const profileMetadata = createProfileMetadata({});

// The photo viewer and identity sheet open over the profile
export const profilePhotoMetadata = createProfileMetadata({ noindex: true });

export const profileIdentityMetadata = createProfileMetadata({ noindex: true });

export const profileFollowersMetadata = createProfileMetadata({
  label: 'Followers',
  noindex: true,
});

export const profileFollowingMetadata = createProfileMetadata({
  label: 'Following',
  noindex: true,
});

export const profileVerificationClaimsMetadata = createProfileMetadata({
  label: 'Verifications',
  subPath: '/verifications/claims',
});

export const profileVerificationVerifiesMetadata = createProfileMetadata({
  label: 'Verifies',
  noindex: true,
});
