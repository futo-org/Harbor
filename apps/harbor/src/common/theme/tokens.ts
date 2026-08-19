import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { isIOS } from '../util/platform';

export const Spacing = {
  '0': 0,
  '2xs': 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

export type SpacingToken = keyof typeof Spacing;

export const Tracking: TextStyle['letterSpacing'] = 0;

export const BorderRadius = {
  '0': 0,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 999,
} as const;

export type BorderRadiusToken = keyof typeof BorderRadius;

/** Type scale (used by `Text` and inputs; import `typography` from `@/common/theme`). */
export const typography = {
  fontSize: {
    xs: 12,
    sm: 14,
    md: 15,
    lg: 18,
    xl: 20,
  } as const,
  fontWeight: {
    regular: '400',
    semibold: '600',
    bold: '700',
  } as const,
  lineHeight: {
    xs: 16,
    sm: 20,
    md: 20,
    lg: 28,
    xl: 32,
  } as const,
};

export type FontSizeToken = keyof typeof typography.fontSize;
export type FontWeightToken = keyof typeof typography.fontWeight;
export type LineHeightToken = keyof typeof typography.lineHeight;

export const Breakpoints = {
  sm: 700,
  md: 1000,
  lg: 1092,
  xl: 1280,
  '2xl': 1400,
} as const;

/**
 * Every `zIndex` in the app comes from here. Only relative order matters;
 * the gaps leave room for new layers.
 */
export const ZIndex = {
  // Above static siblings within a screen (sticky headers, etc).
  raised: 1,
  // Inline (native) tooltip bubble.
  tooltip: 1000,
  // Modal overlays (the Sheet's web overlay). Above expo-router's
  // transparentModal drawer, which vaul mounts to document.body.
  modal: 9999,
  // Web tooltip portal — tooltips can open from inside modals.
  tooltipOverlay: 10000,
  // Toasts sit above everything.
  toast: 10100,
} as const;

export type ZIndexToken = keyof typeof ZIndex;

const atomStyles = {
  /**
   * Position
   */
  relative: {
    position: 'relative',
  },
  absolute: {
    position: 'absolute',
  },
  fixed: {
    position: 'fixed',
  } as unknown as ViewStyle,
  sticky: {
    position: 'sticky',
  } as unknown as ViewStyle,

  inset_0: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },

  /**
   * Cursors
   */
  cursor_default: {
    cursor: 'auto',
  },
  cursor_pointer: {
    cursor: 'pointer',
  },

  /**
   * Flex
   */
  flex: {
    display: 'flex',
  },
  flex_1: {
    flex: 1,
  },
  flex_row: {
    flexDirection: 'row',
  },
  flex_col: {
    flexDirection: 'column',
  },
  flex_wrap: {
    flexWrap: 'wrap',
  },
  flex_grow_0: {
    flexGrow: 0,
  },
  flex_grow_1: {
    flexGrow: 1,
  },
  flex_shrink_0: {
    flexShrink: 0,
  },
  flex_shrink_1: {
    flexShrink: 1,
  },
  flex_basis_0: {
    flexBasis: 0,
  },
  align_center: {
    alignItems: 'center',
  },
  items_center: {
    alignItems: 'center',
  },
  items_start: {
    alignItems: 'flex-start',
  },
  items_end: {
    alignItems: 'flex-end',
  },
  items_stretch: {
    alignItems: 'stretch',
  },
  self_center: {
    alignSelf: 'center',
  },
  self_start: {
    alignSelf: 'flex-start',
  },
  self_end: {
    alignSelf: 'flex-end',
  },
  self_stretch: {
    alignSelf: 'stretch',
  },
  justify_center: {
    justifyContent: 'center',
  },
  justify_between: {
    justifyContent: 'space-between',
  },
  justify_start: {
    justifyContent: 'flex-start',
  },
  justify_end: {
    justifyContent: 'flex-end',
  },
  justify_around: {
    justifyContent: 'space-around',
  },
  justify_evenly: {
    justifyContent: 'space-evenly',
  },

  /**
   * Auto
   */
  overflow_auto: {
    overflow: 'auto',
  },
  overflow_hidden: {
    overflow: 'hidden',
  },
  overflow_visible: {
    overflow: 'visible',
  },

  /**
   * Typography
   */
  text_xs: {
    fontSize: 10,
    letterSpacing: Tracking,
  },
  text_sm: {
    fontSize: 12,
    letterSpacing: Tracking,
  },
  text_md: {
    fontSize: 14,
    letterSpacing: Tracking,
  },
  text_lg: {
    fontSize: 16,
    letterSpacing: Tracking,
  },
  text_xl: {
    fontSize: 18,
    letterSpacing: Tracking,
  },
  text_2xl: {
    fontSize: 20,
    letterSpacing: Tracking,
  },

  text_left: {
    textAlign: 'left',
  },
  text_center: {
    textAlign: 'center',
  },
  text_right: {
    textAlign: 'right',
  },

  text_underline: {
    textDecorationLine: 'underline',
  },

  font_normal: {
    fontWeight: 400,
  },
  font_medium: {
    fontWeight: 500,
  },
  font_semibold: {
    fontWeight: 600,
  },
  font_bold: {
    fontWeight: 700,
  },

  /**
   * Width
   */
  w_full: {
    width: '100%',
  },
  h_full: {
    height: '100%',
  },
  max_w_full: {
    maxWidth: '100%',
  },
  max_h_full: {
    maxHeight: '100%',
  },
  min_w_0: {
    minWidth: 0,
  },
  min_h_0: {
    minHeight: 0,
  },
  hidden: {
    display: 'none',
  },

  gap_0: {
    gap: Spacing['0'],
  },
  gap_2xs: {
    gap: Spacing['2xs'],
  },
  gap_xs: {
    gap: Spacing.xs,
  },
  gap_sm: {
    gap: Spacing.sm,
  },
  gap_md: {
    gap: Spacing.md,
  },
  gap_lg: {
    gap: Spacing.lg,
  },
  gap_xl: {
    gap: Spacing.xl,
  },
  gap_2xl: {
    gap: Spacing['2xl'],
  },
  gap_3xl: {
    gap: Spacing['3xl'],
  },

  p_0: {
    padding: Spacing['0'],
  },
  p_xs: {
    padding: Spacing.xs,
  },
  p_sm: {
    padding: Spacing.sm,
  },
  p_md: {
    padding: Spacing.md,
  },
  p_lg: {
    padding: Spacing.lg,
  },
  p_xl: {
    padding: Spacing.xl,
  },
  p_2xl: {
    padding: Spacing['2xl'],
  },
  p_3xl: {
    padding: Spacing['3xl'],
  },

  px_0: {
    paddingHorizontal: Spacing['0'],
  },
  px_xs: {
    paddingHorizontal: Spacing.xs,
  },
  px_sm: {
    paddingHorizontal: Spacing.sm,
  },
  px_md: {
    paddingHorizontal: Spacing.md,
  },
  px_lg: {
    paddingHorizontal: Spacing.lg,
  },
  px_xl: {
    paddingHorizontal: Spacing.xl,
  },
  px_2xl: {
    paddingHorizontal: Spacing['2xl'],
  },
  px_3xl: {
    paddingHorizontal: Spacing['3xl'],
  },

  py_0: {
    paddingVertical: Spacing['0'],
  },
  py_xs: {
    paddingVertical: Spacing.xs,
  },
  py_sm: {
    paddingVertical: Spacing.sm,
  },
  py_md: {
    paddingVertical: Spacing.md,
  },
  py_lg: {
    paddingVertical: Spacing.lg,
  },
  py_xl: {
    paddingVertical: Spacing.xl,
  },
  py_2xl: {
    paddingVertical: Spacing['2xl'],
  },
  py_3xl: {
    paddingVertical: Spacing['3xl'],
  },

  pt_0: {
    paddingTop: Spacing['0'],
  },
  pt_2xs: {
    paddingTop: Spacing['2xs'],
  },
  pt_xs: {
    paddingTop: Spacing.xs,
  },
  pt_sm: {
    paddingTop: Spacing.sm,
  },
  pt_md: {
    paddingTop: Spacing.md,
  },
  pt_lg: {
    paddingTop: Spacing.lg,
  },
  pt_xl: {
    paddingTop: Spacing.xl,
  },
  pt_2xl: {
    paddingTop: Spacing['2xl'],
  },
  pt_3xl: {
    paddingTop: Spacing['3xl'],
  },

  pb_0: {
    paddingBottom: Spacing['0'],
  },
  pb_xs: {
    paddingBottom: Spacing.xs,
  },
  pb_sm: {
    paddingBottom: Spacing.sm,
  },
  pb_md: {
    paddingBottom: Spacing.md,
  },
  pb_lg: {
    paddingBottom: Spacing.lg,
  },
  pb_xl: {
    paddingBottom: Spacing.xl,
  },
  pb_2xl: {
    paddingBottom: Spacing['2xl'],
  },
  pb_3xl: {
    paddingBottom: Spacing['3xl'],
  },
  pb_4xl: {
    paddingBottom: Spacing['4xl'],
  },

  pl_0: {
    paddingLeft: Spacing['0'],
  },
  pl_xs: {
    paddingLeft: Spacing.xs,
  },
  pl_sm: {
    paddingLeft: Spacing.sm,
  },
  pl_md: {
    paddingLeft: Spacing.md,
  },
  pl_lg: {
    paddingLeft: Spacing.lg,
  },
  pl_xl: {
    paddingLeft: Spacing.xl,
  },
  pl_2xl: {
    paddingLeft: Spacing['2xl'],
  },
  pl_3xl: {
    paddingLeft: Spacing['3xl'],
  },

  pr_0: {
    paddingRight: Spacing['0'],
  },
  pr_xs: {
    paddingRight: Spacing.xs,
  },
  pr_sm: {
    paddingRight: Spacing.sm,
  },
  pr_md: {
    paddingRight: Spacing.md,
  },
  pr_lg: {
    paddingRight: Spacing.lg,
  },
  pr_xl: {
    paddingRight: Spacing.xl,
  },
  pr_2xl: {
    paddingRight: Spacing['2xl'],
  },
  pr_3xl: {
    paddingRight: Spacing['3xl'],
  },

  m_0: {
    margin: Spacing['0'],
  },
  m_xs: {
    margin: Spacing.xs,
  },
  m_sm: {
    margin: Spacing.sm,
  },
  m_md: {
    margin: Spacing.md,
  },
  m_lg: {
    margin: Spacing.lg,
  },
  m_xl: {
    margin: Spacing.xl,
  },
  m_2xl: {
    margin: Spacing['2xl'],
  },
  m_3xl: {
    margin: Spacing['3xl'],
  },

  mx_0: {
    marginHorizontal: Spacing['0'],
  },
  mx_xs: {
    marginHorizontal: Spacing.xs,
  },
  mx_sm: {
    marginHorizontal: Spacing.sm,
  },
  mx_md: {
    marginHorizontal: Spacing.md,
  },
  mx_lg: {
    marginHorizontal: Spacing.lg,
  },
  mx_xl: {
    marginHorizontal: Spacing.xl,
  },
  mx_2xl: {
    marginHorizontal: Spacing['2xl'],
  },
  mx_3xl: {
    marginHorizontal: Spacing['3xl'],
  },

  my_0: {
    marginVertical: Spacing['0'],
  },
  my_xs: {
    marginVertical: Spacing.xs,
  },
  my_sm: {
    marginVertical: Spacing.sm,
  },
  my_md: {
    marginVertical: Spacing.md,
  },
  my_lg: {
    marginVertical: Spacing.lg,
  },
  my_xl: {
    marginVertical: Spacing.xl,
  },
  my_2xl: {
    marginVertical: Spacing['2xl'],
  },
  my_3xl: {
    marginVertical: Spacing['3xl'],
  },

  mt_0: {
    marginTop: Spacing['0'],
  },
  mt_xs: {
    marginTop: Spacing.xs,
  },
  mt_sm: {
    marginTop: Spacing.sm,
  },
  mt_md: {
    marginTop: Spacing.md,
  },
  mt_lg: {
    marginTop: Spacing.lg,
  },
  mt_xl: {
    marginTop: Spacing.xl,
  },
  mt_2xl: {
    marginTop: Spacing['2xl'],
  },
  mt_3xl: {
    marginTop: Spacing['3xl'],
  },
  mt_auto: {
    marginTop: 'auto',
  },

  mb_0: {
    marginBottom: Spacing['0'],
  },
  mb_xs: {
    marginBottom: Spacing.xs,
  },
  mb_sm: {
    marginBottom: Spacing.sm,
  },
  mb_md: {
    marginBottom: Spacing.md,
  },
  mb_lg: {
    marginBottom: Spacing.lg,
  },
  mb_xl: {
    marginBottom: Spacing.xl,
  },
  mb_2xl: {
    marginBottom: Spacing['2xl'],
  },
  mb_3xl: {
    marginBottom: Spacing['3xl'],
  },

  ml_0: {
    marginLeft: Spacing['0'],
  },
  ml_xs: {
    marginLeft: Spacing.xs,
  },
  ml_sm: {
    marginLeft: Spacing.sm,
  },
  ml_md: {
    marginLeft: Spacing.md,
  },
  ml_lg: {
    marginLeft: Spacing.lg,
  },
  ml_xl: {
    marginLeft: Spacing.xl,
  },
  ml_2xl: {
    marginLeft: Spacing['2xl'],
  },
  ml_3xl: {
    marginLeft: Spacing['3xl'],
  },

  mr_0: {
    marginRight: Spacing['0'],
  },
  mr_xs: {
    marginRight: Spacing.xs,
  },
  mr_sm: {
    marginRight: Spacing.sm,
  },
  mr_md: {
    marginRight: Spacing.md,
  },
  mr_lg: {
    marginRight: Spacing.lg,
  },
  mr_xl: {
    marginRight: Spacing.xl,
  },
  mr_2xl: {
    marginRight: Spacing['2xl'],
  },
  mr_3xl: {
    marginRight: Spacing['3xl'],
  },

  rounded_0: {
    borderRadius: BorderRadius['0'],
  },
  rounded_sm: {
    borderRadius: BorderRadius.sm,
  },
  rounded_md: {
    borderRadius: BorderRadius.md,
  },
  rounded_lg: {
    borderRadius: BorderRadius.lg,
  },
  rounded_xl: {
    borderRadius: BorderRadius.xl,
  },
  rounded_full: {
    borderRadius: BorderRadius.full,
  },

  /**
   * Outline
   */
  // `outlineStyle: 'none'` is web-only and not in RN's ViewStyle union, so cast
  // (as TextInput does). On web this fully removes the focus ring that
  // `outlineWidth: 0` alone leaves behind; on native both props are ignored.
  outline_none: {
    outlineStyle: 'none',
    outlineWidth: 0,
  } as unknown as ViewStyle,
} satisfies Record<string, ViewStyle | TextStyle>;
export const Atoms = StyleSheet.create(atomStyles);
