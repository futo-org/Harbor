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
type DefinedStyleSheet<K extends string> = Record<K, ThemedStyleInput> & {
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
export function createThemedStyles<K extends string>(
  buildStyles: (
    theme: Theme,
    define: typeof defineStyleSheet,
  ) => DefinedStyleSheet<K>,
) {
  const stylesByTheme = new Map<Theme, Record<K, FlattenedStyle>>();

  return function useThemedStyles() {
    const { theme } = useTheme();
    let styles = stylesByTheme.get(theme);
    if (!styles) {
      styles = createFlattenedStyleSheet(buildStyles(theme, defineStyleSheet));
      stylesByTheme.set(theme, styles);
    }
    return styles;
  };
}

function defineStyleSheet<K extends string>(
  styleInputs: Record<K, ThemedStyleInput>,
) {
  return styleInputs as DefinedStyleSheet<K>;
}

function createFlattenedStyleSheet<K extends string>(
  styleInputs: Record<K, ThemedStyleInput>,
) {
  const flattenedStyles = {} as Record<K, FlattenedStyle>;
  for (const name in styleInputs) {
    flattenedStyles[name] = StyleSheet.flatten(
      styleInputs[name],
    ) as FlattenedStyle;
  }
  return StyleSheet.create(flattenedStyles);
}
