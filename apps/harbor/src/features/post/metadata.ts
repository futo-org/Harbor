import { APP_NAME, Routes } from '@/src/common/constants';
import { mentionsToPlainText } from '@/src/common/util/parseTextLinks';
import { truncateText } from '@/src/common/util/truncateText';
import { v2 } from '@polycentric/react-native-sdk';
import {
  MODERATION_LABELS,
  findByKey,
  hasModerationLabel,
  toPageImage,
} from '@/src/common/lib/page-metadata/content';
import { unaryCall } from '@/src/common/lib/page-metadata/unary-call';
import {
  type Page,
  plural,
  singleLine,
  toDescription,
} from '@/src/common/lib/page-metadata/page';
import { createAuthoredMetadata } from '@/src/features/profile/lib/create-authored-metadata';
import type { Author } from '@/src/features/profile/lib/load-author';

/** Null if the post is gone or has a moderation label */
async function postPage(
  author: Author,
  path: string,
  keyFingerprint: string,
  sequence: bigint,
  signal: AbortSignal,
): Promise<Page | null> {
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

  const text = singleLine(mentionsToPlainText(post.text));
  const images = post.images.map(toPageImage).filter((image) => image !== null);
  const image = images.at(0);

  return {
    // As `PostScreen` titles it
    title: text
      ? `${author.name} on ${APP_NAME}: "${truncateText(text, 80)}"`
      : `${author.name} on ${APP_NAME}`,
    description:
      toDescription(text) ||
      (image
        ? `${plural(images.length, 'image')} posted by ${author.name}.`
        : `A post by ${author.name} on ${APP_NAME}.`),
    path,
    type: 'article',
    image: image ?? author.avatar,
    imageAlt: image
      ? `Image posted by ${author.name}`
      : `${author.name}'s avatar`,
    largeImage: !!image,
    publishedTime: new Date(Number(found.event.createdAt)).toISOString(),
    authorPath: author.path,
  };
}

export const postMetadata = createAuthoredMetadata(
  'Post',
  Routes.tabs.post,
  postPage,
);
