import { cached } from '@/src/common/lib/head/cached.server';
import { toMetadata, unavailableHead } from '@/src/common/lib/head';
import { routeParam } from '@/src/common/lib/head/route-param.server';
import type { GenerateMetadataFunction } from 'expo-router/server';
import { loadAuthor } from './load-author.server';
import { PROFILE_VIEWS, type ProfileView, profileHead } from './index';

/** A profile, or one of its sub-screens */
function createProfileMetadata(view: ProfileView): GenerateMetadataFunction {
  return async (_request, params) => {
    const identityId = routeParam(params, 'identityId');
    const author = await cached(`profile:${identityId}`, (signal) =>
      loadAuthor(identityId, signal),
    );

    return toMetadata(
      author
        ? profileHead(author, view)
        : unavailableHead('Profile', `/${identityId}`),
    );
  };
}

export const profileMetadata = createProfileMetadata(PROFILE_VIEWS.profile);

export const profilePhotoMetadata = createProfileMetadata(PROFILE_VIEWS.photo);

export const profileIdentityMetadata = createProfileMetadata(
  PROFILE_VIEWS.identity,
);

export const profileFollowersMetadata = createProfileMetadata(
  PROFILE_VIEWS.followers,
);

export const profileFollowingMetadata = createProfileMetadata(
  PROFILE_VIEWS.following,
);

export const profileVerificationClaimsMetadata = createProfileMetadata(
  PROFILE_VIEWS.verificationClaims,
);

export const profileVerificationVerifiesMetadata = createProfileMetadata(
  PROFILE_VIEWS.verificationVerifies,
);
