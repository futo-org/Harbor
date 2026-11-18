import {
  type ImageStyle,
  StyleSheet,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTheme } from './provider';
import type { Theme } from './themes';

type ThemedStyle = ViewStyle | TextStyle | ImageStyle;

type ThemedStyleInput = ThemedStyle | ThemedStyle[];

// Assignable to the `style` prop of any element, whichever kind each entry is for
type FlattenedStyle = ViewStyle & TextStyle & ImageStyle;

declare const definedStyleSheetBrand: unique symbol;

// Only `defineStyleSheet` produces this, so the builder can't skip it
type DefinedStyleSheet<T> = { [P in keyof T]: ThemedStyleInput } & {
  readonly [definedStyleSheetBrand]: true;
};

/**
 * Builds a stylesheet from the theme once per theme and returns a hook that
 * picks the active one. Entries can be arrays (e.g. of `Atoms`), which are
 * flattened into a single style.
 *
 * The builder wraps its stylesheet in `define`: TypeScript rejects unknown
 * style keys only in a literal passed as an argument, not in one a callback
 * returns.
 */
export function createThemedStyles<T>(
  buildStyles: (
    theme: Theme,
    define: typeof defineStyleSheet,
  ) => DefinedStyleSheet<T>,
) {
  const stylesByTheme = new Map<Theme, { [P in keyof T]: FlattenedStyle }>();

  // biome-ignore lint/correctness/noComponentHookFactories: called once at module level
  return function useThemedStyles() {
    const { theme } = useTheme();
    let styles = stylesByTheme.get(theme);
    if (!styles) {
      styles = createFlattenedStyleSheet<T>(
        buildStyles(theme, defineStyleSheet),
      );
      stylesByTheme.set(theme, styles);
    }
    return styles;
  };
}

function defineStyleSheet<T>(
  styleInputs: { [P in keyof T]: ThemedStyleInput },
) {
  return styleInputs as DefinedStyleSheet<T>;
}

function createFlattenedStyleSheet<T>(
  styleInputs: { [P in keyof T]: ThemedStyleInput },
) {
  const flattenedStyles = {} as { [P in keyof T]: FlattenedStyle };
  for (const name in styleInputs) {
    flattenedStyles[name] = StyleSheet.flatten(
      styleInputs[name],
    ) as FlattenedStyle;
  }
  return StyleSheet.create(flattenedStyles);
}
