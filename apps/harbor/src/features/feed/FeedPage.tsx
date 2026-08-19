import type { ListRef } from '@/src/common/components/List';
import { useRef } from 'react';
import FeedList, { type FeedListProps } from './FeedList';
import type { FeedPageControlRef } from './hooks/useFeedTabs';

type FeedPageProps = FeedListProps & {
  /** True for the page being shown; only that page loads. */
  active: boolean;
  /** Where the showing page registers itself for its screen. */
  controlRef?: FeedPageControlRef;
};

/** One page of a tabbed feed screen. */
export function FeedPage({ feed, active, controlRef, ...rest }: FeedPageProps) {
  const listRef = useRef<ListRef>(null);

  // Only the showing page registers, so the screen's handlers reach it without
  // knowing which tab is up. Assigned per render to keep `refresh` current.
  if (active && controlRef) {
    controlRef.current = {
      scrollToTop: () => listRef.current?.scrollToTop(),
      refresh: feed.refresh,
    };
  }

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
