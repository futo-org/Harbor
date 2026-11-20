// Shown on docs/content/developer/examples.md under "Publishing content".

import type { PolycentricClient } from '@polycentric/js-core';
// #region post
import { COLLECTION, v2 } from '@polycentric/js-core';

// #endregion post
// #region image
import { readFile } from 'node:fs/promises';

// #endregion image

export async function post(client: PolycentricClient) {
  // #region post
  const content = client.contentManager.build({
    oneofKind: 'post',
    post: v2.Post.create({ text: 'Hello, Polycentric!' }),
  });
  const { eventKey } = await client.createEvent({
    collection: COLLECTION.FEED,
    content,
  });
  await client.sync();
  // #endregion post
  return eventKey;
}

export async function setProfile(client: PolycentricClient) {
  // #region profile
  const content = client.contentManager.build({
    oneofKind: 'profileUpdate',
    profileUpdate: { name: 'Ada', description: 'Writing about engines.' },
  });
  await client.createEvent({ collection: COLLECTION.PROFILE, content });
  await client.sync();
  // #endregion profile
}

export async function followAndReact(
  client: PolycentricClient,
  otherIdentityKey: string,
  postKey: v2.EventKey,
) {
  // #region follow-react
  await client.createEvent({
    collection: COLLECTION.GRAPH,
    content: client.contentManager.build({
      oneofKind: 'follow',
      follow: { identity: otherIdentityKey },
    }),
  });

  await client.createEvent({
    collection: COLLECTION.INTERACTIONS,
    content: client.contentManager.build({
      oneofKind: 'reaction',
      reaction: { eventKey: postKey, emoji: '👍', positive: true },
    }),
  });

  await client.sync();
  // #endregion follow-react
}

export async function reply(client: PolycentricClient, postKey: v2.EventKey) {
  // #region reply
  const content = client.contentManager.build({
    oneofKind: 'post',
    post: v2.Post.create({
      text: 'Agreed.',
      reply: { parent: postKey, root: postKey },
    }),
  });
  await client.createEvent({ collection: COLLECTION.FEED, content });
  await client.sync();
  // #endregion reply
}

export async function postImage(client: PolycentricClient) {
  // #region image
  const bytes = new Uint8Array(await readFile('./photo.jpg'));
  const blob = await client.commitBlob(bytes, 'image/jpeg');
  await client.uploadBlob(blob, bytes);

  const content = client.contentManager.build({
    oneofKind: 'post',
    post: v2.Post.create({
      text: 'Look at this',
      images: [{ images: [{ blob, width: 1024, height: 768 }] }],
    }),
  });
  await client.createEvent({ collection: COLLECTION.FEED, content });
  await client.sync();
  // #endregion image
}
