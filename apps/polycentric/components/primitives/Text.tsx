import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import {
  useLegacyTheme,
  FontWeightToken,
  ColorToken,
  FontSizeToken,
  LineHeightToken,
} from '@/legacyTheme';

export type TextVariant = 'title' | 'subtitle' | 'body' | 'secondary' | 'small';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: ColorToken;
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
  const { legacyTheme } = useLegacyTheme();

  const config = VARIANT_CONFIG[variant];
  const fontFamily =
    italic && variant !== 'title' && variant !== 'subtitle'
      ? 'Inter-Italic'
      : 'Inter';

  const resolvedFontSize = fontSize
    ? typeof fontSize === 'number'
      ? fontSize
      : legacyTheme.typography.fontSize[fontSize]
    : legacyTheme.typography.fontSize[config.size];

  const resolvedLineHeight = lineHeight
    ? typeof lineHeight === 'number'
      ? lineHeight
      : legacyTheme.typography.lineHeight[lineHeight]
    : legacyTheme.typography.lineHeight[config.size];

  const resolvedFontWeight = fontWeight
    ? legacyTheme.typography.fontWeight[fontWeight]
    : legacyTheme.typography.fontWeight[config.defaultWeight];

  return (
    <RNText
      style={[
        {
          fontFamily,
          color: color ? legacyTheme.colors[color] : legacyTheme.colors.text,
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
  title: { size: 'xl', defaultWeight: 'bold' },
  subtitle: { size: 'lg', defaultWeight: 'semibold' },
  body: { size: 'md', defaultWeight: 'regular' },
  secondary: { size: 'sm', defaultWeight: 'regular' },
  small: { size: 'xs', defaultWeight: 'semibold' },
} as const;
