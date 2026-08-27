import { Tabs, type TabFilterOption } from '@/src/common/components/tabs';
import type { ComponentProps } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { FeedSortOption, FeedTab } from './hooks/feedCache';

export type FeedTabEntry = {
  value: FeedTab;
  label: string;
  /** The tab opens a menu (re-tapped while active). */
  menu?: boolean;
};

/** Home selects between the recommended feed and the following feed. */
export const HOME_TABS = [
  { value: 'for-you', label: 'For you' },
  { value: 'following', label: 'Following', menu: true },
] as const satisfies readonly FeedTabEntry[];

/** Explore selects between the posts feed and people. */
export const EXPLORE_TABS = [
  { value: 'posts', label: 'Posts', menu: true },
  { value: 'people', label: 'People' },
] as const satisfies readonly FeedTabEntry[];

/** The sort filter behind the menu tabs above. */
export const SORT_OPTIONS: readonly TabFilterOption<FeedSortOption>[] = [
  { value: 'latest', label: 'Latest', icon: 'star' },
  { value: 'top', label: 'Top', icon: 'rocket' },
];

/** Tab order for the rows above, for `PagerView`. */
export const HOME_TAB_VALUES = HOME_TABS.map(
  (tab) => tab.value,
) satisfies readonly FeedTab[];
export const EXPLORE_TAB_VALUES = EXPLORE_TABS.map(
  (tab) => tab.value,
) satisfies readonly FeedTab[];

export type ExploreTab = (typeof EXPLORE_TAB_VALUES)[number];

export function isExploreTab(tab: FeedTab): tab is ExploreTab {
  return EXPLORE_TAB_VALUES.includes(tab as ExploreTab);
}

type FeedTabsProps = {
  tabs: readonly FeedTabEntry[];
  active: FeedTab;
  onPress: (tab: FeedTab) => void;
  /** The pager's swipe position, so the indicator tracks the drag. */
  progress?: SharedValue<number>;
  /** Attached to the entry marked `menu`; see `Tabs.Tab`'s `menu` prop. */
  menu?: ComponentProps<typeof Tabs.Tab>['menu'];
};

/** Tab row selecting what a feed screen shows. */
export function FeedTabs({
  tabs,
  active,
  onPress,
  progress,
  menu,
}: FeedTabsProps) {
  return (
    <Tabs progress={progress}>
      {tabs.map((tab) => (
        <Tabs.Tab
          key={tab.value}
          active={active === tab.value}
          menu={tab.menu ? menu : undefined}
          onPress={() => onPress(tab.value)}
        >
          {tab.label}
        </Tabs.Tab>
      ))}
    </Tabs>
  );
}
