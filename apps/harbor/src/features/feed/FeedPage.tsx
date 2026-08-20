import type { ListRef } from '@/src/common/components/List';
import { useFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { useRef } from 'react';
import FeedList, { type FeedListProps } from './FeedList';

type FeedPageProps = FeedListProps & {
  /** True for the page being shown; only that page loads. */
  active: boolean;
};

/** One page of a tabbed feed screen. */
export function FeedPage({ feed, active, ...rest }: FeedPageProps) {
  const listRef = useRef<ListRef>(null);

  // A nav or tab re-tap scrolls back to the top and refreshes; only the
  // showing page listens.
  useFocusedRefresh(() => {
    listRef.current?.scrollToTop();
    feed.refresh();
  }, active);

  // An unopened page has nothing and is not fetching, so it stands as a
  // skeleton rather than claiming the feed is empty.
  const pending = !active && feed.items.length === 0;

  return (
    <FeedList
      ref={listRef}
      feed={pending ? { ...feed, isLoading: true } : feed}
      {...rest}
    />
  );
}
