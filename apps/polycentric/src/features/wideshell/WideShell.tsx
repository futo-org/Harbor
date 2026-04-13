import { WEB_MAX_CONTENT_WIDTH } from '@/src/common/constants';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { ToastProvider } from '@/src/common/lib/toast';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { WideShellLeftBar } from './WideShellLeftBar';
import { WideShellRightBar } from './WideShellRightBar';
import { WideShellMode, useWideShellMode } from './useWideShellMode';

const LEFT_RAIL_COLUMN_MIN_WIDTH = 72;
const COLLAPSE_LEFT_RAIL_MAX_WIDTH = 200;
const NARROW_LEFT_COLUMN_WIDTH = 73;
const COLLAPSE_RIGHT_COLUMN_FLEX_GROW = 4;

type WideShellProps = {
  children: ReactNode;
};

export function WideShell({ children }: WideShellProps) {
  const { theme } = useTheme();
  const wideShellMode = useWideShellMode();
  const showWideShellChrome = wideShellMode !== WideShellMode.Narrow;
  const showRightSidebarContent =
    wideShellMode === WideShellMode.CollapseLeftBar ||
    wideShellMode === WideShellMode.Full;
  const railEdgeColor = withHexOpacity(theme.palette.neutral_500, '20');

  const centerColumnStyle = [
    ...(showWideShellChrome ? [] : [Atoms.flex_1]),
    Atoms.max_w_full,
    {
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderLeftColor: railEdgeColor,
      borderRightColor: railEdgeColor,
      ...(showWideShellChrome
        ? {
            width: WEB_MAX_CONTENT_WIDTH,
            flexGrow: 0,
            flexShrink: 0,
          }
        : {}),
    },
  ];

  const centerColumn = (
    <View
      style={centerColumnStyle}
      accessibilityRole={'main' as import('react-native').AccessibilityRole}
    >
      <ToastProvider>{children}</ToastProvider>
    </View>
  );

  return (
    <View style={[Atoms.flex_1, theme.atoms.bg, Atoms.flex_row, Atoms.min_w_0]}>
      {showWideShellChrome ? (
        <>
          {wideShellMode === WideShellMode.CollapseLeftBar ? (
            <View
              style={[
                Atoms.flex_grow_1,
                Atoms.flex_shrink_1,
                Atoms.flex_basis_0,
                {
                  minWidth: LEFT_RAIL_COLUMN_MIN_WIDTH,
                  maxWidth: COLLAPSE_LEFT_RAIL_MAX_WIDTH,
                },
              ]}
            >
              <View
                style={[
                  Atoms.flex_1,
                  Atoms.flex_row,
                  Atoms.justify_end,
                  Atoms.self_stretch,
                  Atoms.px_sm,
                  Atoms.min_w_0,
                ]}
              >
                <WideShellLeftBar />
              </View>
            </View>
          ) : (
            <View
              style={[
                Atoms.flex_1,
                Atoms.min_w_0,
                Atoms.flex_row,
                ...(wideShellMode === WideShellMode.OmitRightBar
                  ? [Atoms.px_sm, { minWidth: LEFT_RAIL_COLUMN_MIN_WIDTH }]
                  : [Atoms.px_lg]),
              ]}
            >
              <View style={[Atoms.flex_1, Atoms.min_w_0]} />
              <WideShellLeftBar />
            </View>
          )}
          {centerColumn}
          <View
            style={[
              wideShellMode === WideShellMode.CollapseLeftBar
                ? { flexGrow: COLLAPSE_RIGHT_COLUMN_FLEX_GROW }
                : Atoms.flex_grow_1,
              Atoms.flex_shrink_1,
              Atoms.flex_basis_0,
              Atoms.min_w_0,
              Atoms.px_lg,
              Atoms.flex_row,
              Atoms.justify_start,
            ]}
          >
            {showRightSidebarContent ? <WideShellRightBar /> : null}
          </View>
        </>
      ) : (
        <>
          <View
            style={[
              Atoms.flex_shrink_0,
              Atoms.flex_row,
              Atoms.justify_center,
              { width: NARROW_LEFT_COLUMN_WIDTH, alignSelf: 'stretch' },
            ]}
          >
            <WideShellLeftBar />
          </View>
          {centerColumn}
        </>
      )}
    </View>
  );
}
