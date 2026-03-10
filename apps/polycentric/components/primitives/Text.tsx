import { Text as RNText, TextProps as RNTextProps } from "react-native";
import {
  useTheme,
  FontWeightToken,
  ColorToken,
  FontSizeToken,
  LineHeightToken,
} from "@/theme";

export type TextVariant = "title" | "subtitle" | "body" | "secondary" | "small";

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: ColorToken;
  fontWeight?: FontWeightToken;
  fontSize?: FontSizeToken | number;
  lineHeight?: LineHeightToken | number;
  italic?: boolean;
}

export function Text({
  variant = "body",
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
  const fontFamily =
    italic && variant !== "title" && variant !== "subtitle"
      ? "Inter-Italic"
      : "Inter";

  const resolvedFontSize = fontSize
    ? typeof fontSize === "number"
      ? fontSize
      : theme.typography.fontSize[fontSize]
    : theme.typography.fontSize[config.size];

  const resolvedLineHeight = lineHeight
    ? typeof lineHeight === "number"
      ? lineHeight
      : theme.typography.lineHeight[lineHeight]
    : theme.typography.lineHeight[config.size];

  const resolvedFontWeight = fontWeight
    ? theme.typography.fontWeight[fontWeight]
    : theme.typography.fontWeight[config.defaultWeight];

  return (
    <RNText
      style={[
        {
          fontFamily,
          color: color ? theme.colors[color] : theme.colors.text,
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
  title: { size: "xl", defaultWeight: "bold" },
  subtitle: { size: "lg", defaultWeight: "semibold" },
  body: { size: "md", defaultWeight: "regular" },
  secondary: { size: "sm", defaultWeight: "regular" },
  small: { size: "xs", defaultWeight: "semibold" },
} as const;
