import { Tabs } from '@/src/common/components/Tabs';
import type { FeedSortOption } from './hooks/feedCache';

type FeedSortTabsProps = {
  sort: FeedSortOption;
  onSortPress: (sort: FeedSortOption) => void;
};

/** Tab bar selecting the order a sortable feed is shown in. */
export function FeedSortTabs({ sort, onSortPress }: FeedSortTabsProps) {
  return (
    <Tabs>
      <Tabs.Tab active={sort === 'top'} onPress={() => onSortPress('top')}>
        Top
      </Tabs.Tab>
      <Tabs.Tab
        active={sort === 'latest'}
        onPress={() => onSortPress('latest')}
      >
        Latest
      </Tabs.Tab>
    </Tabs>
  );
}
