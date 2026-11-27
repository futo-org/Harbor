import { Routes } from '@/src/common/constants';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { toHeadImage } from '@/src/common/lib/head/content';
import type { Head } from '@/src/common/lib/head';
import { useAuthoredHead } from '@/src/features/profile/head/useAuthoredHead';
import { postHead } from './index';

/** The head of the post the screen has loaded. Null while loading */
export function usePostHead(
  post: PostData | null,
  isLoading: boolean,
): Head | null {
  return useAuthoredHead('Post', post, isLoading, (author, loaded) =>
    postHead({
      author,
      path: Routes.tabs.post(
        loaded.identity,
        getKeyFingerprint(loaded.signedBy),
        loaded.sequence,
      ),
      text: loaded.content,
      images: loaded.images.map(toHeadImage).filter((image) => image !== null),
      createdAt: loaded.createdAt,
    }),
  );
}
