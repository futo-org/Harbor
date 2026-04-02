import { useWindowDimensions } from 'react-native';
import { Breakpoints } from './tokens';

export function useBreakpoint() {
  const { width } = useWindowDimensions();

  return {
    isMobile: width < Breakpoints.sm,
    isTablet: width >= Breakpoints.sm && width < Breakpoints.md,
    isSmall: width < Breakpoints.md,
    isLarge: width >= Breakpoints.lg,
    width,
  };
}
