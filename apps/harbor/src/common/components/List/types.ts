import type {
  FlashListProps,
  ListRenderItem,
  ListRenderItemInfo,
} from '@shopify/flash-list';
import type React from 'react';
import type { SharedValue } from 'react-native-reanimated';

export type { FlashListProps, ListRenderItem, ListRenderItemInfo };

export type ListProps<T> = FlashListProps<T> & {
  HeaderComponent?:
    | React.ComponentType<any>
    | React.ReactElement<unknown, string | React.JSXElementConstructor<any>>
    | React.ExoticComponent<any>
    | null
    | undefined;
  /** Known height of `HeaderComponent`, used until it reports its own. */
  initialHeaderHeight?: number;
  /** Tracks the scroll offset */
  scrollY?: SharedValue<number>;
  /** Web: remembers the scroll position under this key across unmounts. */
  restorationKey?: string;
};

/** Imperative handle exposed by `List` (and `FeedList`). */
export type ListRef = {
  scrollToTop: (options?: { animated?: boolean }) => void;
};
