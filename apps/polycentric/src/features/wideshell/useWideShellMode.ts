import { useWindowDimensions } from 'react-native';

import { Breakpoints } from '@/src/common/theme';

export const WideShellBreakpoints = {
  narrowMax: 720,
  omitRightBarMax: 960,
} as const;

export enum WideShellMode {
  Narrow = 'narrow',
  OmitRightBar = 'omitRightBar',
  CollapseLeftBar = 'collapseLeftBar',
  Full = 'full',
}

export function wideShellModeFromWidth(width: number): WideShellMode {
  if (width < WideShellBreakpoints.narrowMax) return WideShellMode.Narrow;
  if (width < WideShellBreakpoints.omitRightBarMax) return WideShellMode.OmitRightBar;
  if (width < Breakpoints.xl) return WideShellMode.CollapseLeftBar;
  return WideShellMode.Full;
}

export function useWideShellMode(): WideShellMode {
  const { width } = useWindowDimensions();
  return wideShellModeFromWidth(width);
}
