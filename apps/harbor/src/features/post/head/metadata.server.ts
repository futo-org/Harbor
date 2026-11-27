import { Routes } from '@/src/common/constants';
import {
  MODERATION_LABELS,
  findByKey,
  hasModerationLabel,
  toHeadImage,
} from '@/src/common/lib/head/content';
import type { Head } from '@/src/common/lib/head';
import { unaryCall } from '@/src/common/lib/head/unary-call.server';
import { createAuthoredMetadata } from '@/src/features/profile/head/create-authored-metadata.server';
import type { Author } from '@/src/features/profile/head';
import { v2 } from '@polycentric/react-native-sdk';
import { postHead } from './index';

/** Null if the post is gone or has a moderation label */
async function loadPostHead(
  author: Author,
  path: string,
  keyFingerprint: string,
  sequence: bigint,
  signal: AbortSignal,
): Promise<Head | null> {
  const response = await unaryCall(
    'FeedsService/GetPost',
    v2.GetPostRequest,
    v2.GetPostResponse,
    { identity: author.identity, sequence, omitLabels: MODERATION_LABELS },
    signal,
  );

  const found = findByKey(
    response.candidates,
    'post',
    keyFingerprint,
    sequence,
  );
  if (!found) return null;

  const post = found.content;
  if (hasModerationLabel(response.eventHints, post.labels)) return null;

  return postHead({
    author,
    path,
    text: post.text,
    images: post.images.map(toHeadImage).filter((image) => image !== null),
    createdAt: Number(found.event.createdAt),
  });
}

export const postMetadata = createAuthoredMetadata(
  'Post',
  Routes.tabs.post,
  loadPostHead,
);
