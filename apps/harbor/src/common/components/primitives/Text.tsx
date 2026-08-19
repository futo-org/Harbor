import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import {
  useTheme,
  typography,
  type FontWeightToken,
  type PaletteColorToken,
  type FontSizeToken,
  type LineHeightToken,
} from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';

const WEB_FONT_STACK =
  'NotoSans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export type TextVariant = 'title' | 'subtitle' | 'body' | 'secondary' | 'small';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: PaletteColorToken;
  fontWeight?: FontWeightToken;
  fontSize?: FontSizeToken | number;
  lineHeight?: LineHeightToken | number;
  italic?: boolean;
}

export function Text({
  variant = 'body',
  color,
  fontWeight,
  fontSize,
  lineHeight,
  italic,
  style,
  ...props
}: TextProps) {
  const { theme } = useTheme();

  const config = VARIANT_CONFIG[variant];
  const wantsItalic = italic && variant !== 'title' && variant !== 'subtitle';

  const fontFamily = isWeb
    ? WEB_FONT_STACK
    : wantsItalic
      ? 'NotoSans-Italic'
      : 'NotoSans';

  const resolvedFontSize = fontSize
    ? typeof fontSize === 'number'
      ? fontSize
      : typography.fontSize[fontSize]
    : typography.fontSize[config.size];

  const resolvedLineHeight = lineHeight
    ? typeof lineHeight === 'number'
      ? lineHeight
      : typography.lineHeight[lineHeight]
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
          ...(isWeb && wantsItalic ? { fontStyle: 'italic' as const } : {}),
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
