import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import {
  useTheme,
  typography,
  type FontWeightToken,
  type PaletteColorToken,
  type FontSizeToken,
  type LineHeightToken,
} from '@/src/common/theme';

export type TextVariant = 'title' | 'subtitle' | 'body' | 'secondary' | 'small';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: PaletteColorToken;
  fontWeight?: FontWeightToken;
  fontSize?: FontSizeToken | number;
  lineHeight?: LineHeightToken | number;
  /** Drop the leading: line height equals the font size. For single-line
   * rows (e.g. post headers) where the text box should hug the glyphs. */
  compact?: boolean;
  italic?: boolean;
}

export function Text({
  variant = 'body',
  color,
  fontWeight,
  fontSize,
  lineHeight,
  compact = false,
  italic,
  style,
  ...props
}: TextProps) {
  const { theme } = useTheme();

  const config = VARIANT_CONFIG[variant];
  const fontFamily =
    italic && variant !== 'title' && variant !== 'subtitle'
      ? 'Inter-Italic'
      : 'Inter';

  const resolvedFontSize = fontSize
    ? typeof fontSize === 'number'
      ? fontSize
      : typography.fontSize[fontSize]
    : typography.fontSize[config.size];

  const resolvedLineHeight = lineHeight
    ? typeof lineHeight === 'number'
      ? lineHeight
      : typography.lineHeight[lineHeight]
    : compact
      ? resolvedFontSize
      : typography.lineHeight[config.size];

  const resolvedFontWeight = fontWeight
    ? typography.fontWeight[fontWeight]
    : typography.fontWeight[config.defaultWeight];

  return (
    <RNText
      style={[
        {
          fontFamily,
          color: color ? theme.palette[color] : theme.palette.neutral_900,
          fontSize: resolvedFontSize,
          fontWeight: resolvedFontWeight,
          lineHeight: resolvedLineHeight,
        },
        style,
      ]}
      {...props}
    />
  );
}

const VARIANT_CONFIG: Record<
  TextVariant,
  { size: FontSizeToken; defaultWeight: FontWeightToken }
> = {
  title: { size: 'lg', defaultWeight: 'bold' },
  subtitle: { size: 'lg', defaultWeight: 'semibold' },
  body: { size: 'md', defaultWeight: 'regular' },
  secondary: { size: 'md', defaultWeight: 'regular' },
  small: { size: 'xs', defaultWeight: 'semibold' },
} as const;
