import { Tabs } from '@/src/common/components/Tabs';
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

type FeedTabsProps = {
  tabs: readonly FeedTabEntry[];
  active: FeedTab;
  onPress: (tab: FeedTab) => void;
};

/** Tab row selecting what a feed screen shows. */
export function FeedTabs({ tabs, active, onPress }: FeedTabsProps) {
  return (
    <Tabs>
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
