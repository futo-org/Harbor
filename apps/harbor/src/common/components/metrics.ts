import { Spacing, typography } from '../theme';

/** `Topbar`'s height, for layouts that reserve its space. */
export const TOPBAR_HEIGHT = 60;

/** `Tabs`' height, for layouts that reserve its space. */
export const TABS_HEIGHT = Spacing.md * 2 + typography.lineHeight.md + 1;

/** Web layout sizes; `BootSkeleton` mirrors the layout from these too. */
export const LAYOUT_SIZES = {
  // Main's width for viewports up to each breakpoint, then above `2xl`.
  mainUpToMd: 600,
  mainUpToLg: 920,
  mainUpTo2xl: 990,
  mainMax: 1050,
  primaryColumnMaxWidth: 600,
  leftSidebarNarrowWidth: 88,
  leftSidebarWideWidth: 275,
  leftSidebarWidePadding: 30,
  rightSidebarWidth: 350,
  rightSidebarNarrowMargin: 10,
  rightSidebarWideMargin: 70,
} as const;
