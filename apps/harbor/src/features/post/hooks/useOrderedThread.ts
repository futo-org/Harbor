import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { useMemo } from 'react';

/**
 * Thread items ordered for display: the subject's ancestor chain, then the
 * subject, then everything else (the replies) in their given order. The
 * server's order isn't guaranteed, so this keeps a reply from rendering
 * where a parent belongs. Just the subject while the thread is empty.
 */
export function useOrderedThread(
  subject: PostData,
  items: PostData[],
): PostData[] {
  return useMemo(() => {
    if (items.length === 0) return [subject];

    const byId = new Map(items.map((p) => [p.id, p]));
    const resolvedSubject = byId.get(subject.id) ?? subject;
    const placed = new Set([resolvedSubject.id]);

    const ancestors: PostData[] = [];
    let cursor = resolvedSubject;
    while (cursor.reply?.parentId) {
      const parent = byId.get(cursor.reply.parentId);
      if (!parent || placed.has(parent.id)) break;
      ancestors.unshift(parent);
      placed.add(parent.id);
      cursor = parent;
    }

    const replies = items.filter((p) => !placed.has(p.id));
    return [...ancestors, resolvedSubject, ...replies];
  }, [subject, items]);
}
