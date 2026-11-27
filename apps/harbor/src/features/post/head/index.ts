import { APP_NAME } from '@/src/common/constants';
import type { HeadImage } from '@/src/common/lib/head/content';
import {
  type Head,
  plural,
  singleLine,
  toDescription,
} from '@/src/common/lib/head';
import { mentionsToPlainText } from '@/src/common/util/parseTextLinks';
import { truncateText } from '@/src/common/util/truncateText';
import type { Author } from '@/src/features/profile/head';

export type PostHeadInput = {
  author: Author;
  /** Canonical path of the post */
  path: string;
  text: string;
  images: HeadImage[];
  /** Ms since the Unix epoch */
  createdAt: number;
};

export function postHead({
  author,
  path,
  text: rawText,
  images,
  createdAt,
}: PostHeadInput): Head {
  const text = singleLine(mentionsToPlainText(rawText));
  const image = images.at(0);

  return {
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
    publishedTime: new Date(createdAt).toISOString(),
    authorPath: author.path,
  };
}
