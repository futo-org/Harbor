// Shown on docs/content/developer/examples.md under "Reading".

import type { PolycentricClient } from '@polycentric/js-core';
// #region profile
import { v2 } from '@polycentric/js-core';
import { Query } from '@polycentric/rs-core-wasm';

// #endregion profile

export async function readProfile(
  client: PolycentricClient,
  identityKey: string,
) {
  // #region profile
  const bytes = await client.core.awaitQuery(
    new Query.GetProfile({ identity: identityKey }),
    undefined,
    undefined,
  );
  if (bytes) {
    const profile = v2.GetProfileResponse.fromBinary(new Uint8Array(bytes));
    console.log(profile.followersCount, 'followers');

    for (const bundle of profile.eventBundles) {
      const contentBytes = bundle.serializedContent?.contentBytes;
      if (!contentBytes) continue;
      const content = v2.Content.fromBinary(contentBytes);
      if (content.contentBody.oneofKind === 'profileUpdate') {
        console.log(content.contentBody.profileUpdate.name);
      }
    }
  }
  // #endregion profile
}

export async function readIdentityFeed(
  client: PolycentricClient,
  identityKey: string,
) {
  // #region identity-feed
  const bytes = await client.core.awaitQuery(
    new Query.GetIdentityFeed({
      identity: identityKey,
      limit: 20,
      omitLabels: [],
    }),
    undefined,
    undefined,
  );
  if (bytes) {
    const feed = v2.GetFeedResponse.fromBinary(new Uint8Array(bytes));
    for (const bundle of feed.eventBundles) {
      const contentBytes = bundle.serializedContent?.contentBytes;
      if (!contentBytes) continue;
      const content = v2.Content.fromBinary(contentBytes);
      if (content.contentBody.oneofKind === 'post') {
        console.log(content.contentBody.post.text);
      }
    }
  }
  // #endregion identity-feed
}

export async function readEvent(
  client: PolycentricClient,
  postKey: v2.EventKey,
) {
  // #region single-event
  const bytes = await client.core.awaitQuery(
    new Query.GetEvent({
      identity: postKey.identity,
      collection: postKey.collection,
      sequence: postKey.sequence,
    }),
    undefined,
    undefined,
  );
  const bundle = bytes && v2.EventBundle.fromBinary(new Uint8Array(bytes));
  // #endregion single-event
  return bundle;
}
