import { Tabs } from '@/src/common/components/Tabs';
import type { SharedValue } from 'react-native-reanimated';
import type { FeedTab } from './hooks/feedCache';

export type FeedTabEntry = { value: FeedTab; label: string };

/** Home selects between the recommended feed and the following feed's sorts. */
export const HOME_TABS: readonly FeedTabEntry[] = [
  { value: 'for-you', label: 'For you' },
  { value: 'top', label: 'Top' },
  { value: 'latest', label: 'Latest' },
];

/** Explore only sorts. */
export const SORT_TABS: readonly FeedTabEntry[] = [
  { value: 'top', label: 'Top' },
  { value: 'latest', label: 'Latest' },
];

/** Tab order for the rows above, for `PagerView`. */
export const HOME_TAB_VALUES: readonly FeedTab[] = HOME_TABS.map(
  (tab) => tab.value,
);
export const SORT_TAB_VALUES: readonly FeedTab[] = SORT_TABS.map(
  (tab) => tab.value,
);

type FeedTabsProps = {
  tabs: readonly FeedTabEntry[];
  active: FeedTab;
  onPress: (tab: FeedTab) => void;
  /** The pager's swipe position, so the indicator tracks the drag. */
  progress?: SharedValue<number>;
};

/** Tab row selecting what a feed screen shows. */
export function FeedTabs({ tabs, active, onPress, progress }: FeedTabsProps) {
  return (
    <Tabs progress={progress}>
      {tabs.map((tab) => (
        <Tabs.Tab
          key={tab.value}
          active={active === tab.value}
          onPress={() => onPress(tab.value)}
        >
          {tab.label}
        </Tabs.Tab>
      ))}
    </Tabs>
  );
}
