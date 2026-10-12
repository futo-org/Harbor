import { HARBOR_APP_URL, Routes } from '@/src/common/constants';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';

export function buildPostLink(post: PostData) {
  const path = Routes.tabs.post(
    post.identity,
    getKeyFingerprint(post.signedBy) ?? '',
    post.sequence,
  );
  return `${HARBOR_APP_URL}${path}`;
}
