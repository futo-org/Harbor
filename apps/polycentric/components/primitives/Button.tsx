import {
  Pressable,
  PressableProps,
  StyleSheet,
  Animated,
  ViewStyle,
  StyleProp,
  View,
} from "react-native";
import {
  Canvas,
  RoundedRect,
  LinearGradient,
  vec,
  Path,
  Skia,
} from "@shopify/react-native-skia";
import { Text } from "./Text";
import {
  useTheme,
  FontWeightToken,
  BorderRadiusToken,
  ColorToken,
  Theme,
} from "@/theme";
import { usePressAnimation } from "@/lib/animation";
import { useMemo, useState } from "react";

// TODO: add expo blur to all non primary
type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "disabled"
  | "destructive";

type ButtonSize = "sm" | "md" | "lg";

type IconRenderFn = (props: {
  size: number;
  color: string;
  style?: object;
}) => React.ReactNode;

interface ButtonProps extends Omit<PressableProps, "style"> {
  onPress: () => void;
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  style?: StyleProp<ViewStyle>;
  icon?: IconRenderFn;
  fullWidth?: boolean;
}

const SIZE_CONFIG: Record<
  ButtonSize,
  {
    paddingV: number;
    paddingH: number;
    iconSize: number;
    borderRadius: BorderRadiusToken;
  }
> = {
  sm: { paddingV: 4, paddingH: 6, iconSize: 16, borderRadius: "sm" },
  md: { paddingV: 12, paddingH: 18, iconSize: 20, borderRadius: "lg" },
  lg: { paddingV: 18, paddingH: 24, iconSize: 24, borderRadius: "lg" },
};

export function Button({
  onPress,
  title,
  variant = "primary",
  size = "md",
  style,
  icon,
  fullWidth = false,
  ...props
}: ButtonProps) {
  const { theme } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();
  const [layout, setLayout] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const variantStyle = getVariantStyle(theme, variant);

  const sizeConfig = SIZE_CONFIG[size];
  const borderRadius = theme.borderRadius[sizeConfig.borderRadius];

  const baseStyle = {
    paddingVertical: sizeConfig.paddingV,
    paddingHorizontal: sizeConfig.paddingH,
    borderRadius,
  };

  const isDisabled = variant === "disabled";
  const iconColor = theme.colors[textColorMap[variant]];
  const isPrimary = variant === "primary";

  const textShadowStyle = isPrimary
    ? {
        textShadowColor: "rgba(0, 0, 0, 0.5)",
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 6,
      }
    : undefined;

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={isDisabled ? undefined : onPress}
        onPressIn={isDisabled ? undefined : onPressIn}
        onPressOut={isDisabled ? undefined : onPressOut}
        hitSlop={8}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setLayout({ width, height });
        }}
        style={[
          styles.base,
          !fullWidth && styles.fitContent,
          baseStyle,
          !isPrimary && variantStyle,
          style,
        ]}
        {...props}
      >
        {isPrimary && layout && (
          <PrimaryButtonBackground
            width={layout.width}
            height={layout.height}
            borderRadius={borderRadius}
          />
        )}
        <View style={[styles.content, icon && title && { marginLeft: -3 }]}>
          {icon &&
            icon({
              size: sizeConfig.iconSize,
              color: iconColor,
              style: textShadowStyle,
            })}
          <Text
            fontWeight={FONT_WEIGHT}
            color={textColorMap[variant]}
            numberOfLines={1}
            style={textShadowStyle}
          >
            {title}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// My german pal Mr. Claude Code wrote this, I can't take credit.
//   -Austin aka A-Dog akaka 'the lizard'.
function PrimaryButtonBackground({
  width,
  height,
  borderRadius,
}: {
  width: number;
  height: number;
  borderRadius: number;
}) {
  // renders gradient fill, dark border, and top highlight
  const { theme } = useTheme();

  const highlightPath = useMemo(() => {
    const path = Skia.Path.Make();
    const inset = 2.5;
    const strokeWidth = 2;

    // Outer edge (top of stroke)
    const outerInset = inset - strokeWidth / 2;
    const outerR = borderRadius - outerInset;

    // Inner edge (bottom of stroke)
    const innerInset = inset + strokeWidth / 2;
    const innerR = borderRadius - innerInset;

    // The taper point on each side (where inner and outer meet)
    const leftTaperY = borderRadius + inset * 0.5;
    const rightTaperX = width - inset;

    // Start at left taper point
    path.moveTo(inset, leftTaperY);
    // Outer arc - top left corner
    path.arcToTangent(
      outerInset,
      outerInset,
      outerR + outerInset,
      outerInset,
      outerR
    );
    // Across top (outer edge)
    path.lineTo(width - outerR - outerInset, outerInset);
    // Outer arc - top right corner, ends at right taper point
    path.arcToTangent(
      width - outerInset,
      outerInset,
      rightTaperX,
      leftTaperY,
      outerR
    );

    // Line to right taper point (inner edge starts here too)
    path.lineTo(rightTaperX, leftTaperY);
    // Inner arc - top right corner
    path.arcToTangent(
      width - innerInset,
      innerInset,
      width - innerR - innerInset,
      innerInset,
      innerR
    );
    // Across top (inner edge)
    path.lineTo(innerR + innerInset, innerInset);
    // Inner arc - top left corner, back to left taper point
    path.arcToTangent(innerInset, innerInset, inset, leftTaperY, innerR);

    path.close();

    return path;
  }, [width, borderRadius]);

  const borderInset = 0.75;

  return (
    <Canvas
      style={{
        position: "absolute",
        top: -BORDER_WIDTH,
        left: -BORDER_WIDTH,
        width: width,
        height: height,
      }}
    >
      <RoundedRect x={0} y={0} width={width} height={height} r={borderRadius}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(width, height)}
          colors={[theme.colors.primary, theme.colors.primaryDarker]}
        />
      </RoundedRect>

      <RoundedRect
        x={borderInset}
        y={borderInset}
        width={width - borderInset * 2}
        height={height - borderInset * 2}
        r={borderRadius - borderInset}
        style="stroke"
        strokeWidth={2}
        color="rgba(0, 0, 0, 0.2)"
      />

      <Path path={highlightPath} color="rgba(255, 255, 255, 0.1)" />
    </Canvas>
  );
}

const BORDER_WIDTH = 1.5;

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: BORDER_WIDTH,
    borderColor: "transparent",
  },
  fitContent: {
    alignSelf: "flex-start",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});

const textColorMap: Record<ButtonVariant, ColorToken> = {
  primary: "white",
  secondary: "primary",
  tertiary: "text",
  disabled: "neutralSurfaceOpacity80",
  destructive: "destructive",
};

const FONT_WEIGHT: FontWeightToken = "semibold";

function getVariantStyle(theme: Theme, variant: ButtonVariant) {
  switch (variant) {
    case "primary":
      // uses Skia for rendering, no styles here
      return {};
    case "secondary":
      return {
        backgroundColor: theme.colors.primaryOpacity20,
        borderColor: theme.colors.primaryOpacity40,
      };
    case "tertiary":
      return {
        backgroundColor: "transparent",
        borderColor: theme.colors.neutralSurfaceOpacity60,
      };
    case "disabled":
      return {
        backgroundColor: theme.colors.neutralSurfaceOpacity20,
        borderColor: theme.colors.neutralSurfaceOpacity40,
      };
    case "destructive":
      return {
        backgroundColor: theme.colors.destructiveOpacity15,
        borderColor: theme.colors.destructiveOpacity80,
      };
  }
}
