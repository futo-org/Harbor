import { hasModerationLabelValue } from '@/src/common/lib/head/content';
import { type Head, unavailableHead } from '@/src/common/lib/head';
import { usePathname } from 'expo-router';
import type { Author } from './index';
import { useAuthor } from './useAuthor';

type AuthoredContent = {
  identity: string;
  labels?: { value: string }[];
};

/**
 * The head of a post, claim or calendar event the screen has loaded. The
 * client's `createAuthoredMetadata`: content that is gone or has a
 * moderation label gets the same unavailable head. Null while loading.
 */
export function useAuthoredHead<Content extends AuthoredContent>(
  unavailableTitle: string,
  content: Content | null,
  isLoading: boolean,
  toHead: (author: Author, content: Content) => Head,
): Head | null {
  const author = useAuthor(content?.identity);
  const path = usePathname();

  if (!content) {
    return isLoading ? null : unavailableHead(unavailableTitle, path);
  }

  if (!author) return null;

  const labelValues = (content.labels ?? []).map((label) => label.value);

  if (author.sensitive || hasModerationLabelValue(labelValues)) {
    return unavailableHead(unavailableTitle, path);
  }

  return toHead(author, content);
}
