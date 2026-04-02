import { useTheme, withHexOpacity } from '@/src/common/theme';
import { StyleSheet, View } from 'react-native';

type GradientVariant = 'top' | 'surround';
type MatrixOverlayVariant = 'neutral' | 'colored';

// TODO: this is tough to get right. Will need to tinker for a while to replicate figma mockups.
export type BackgroundProps =
  | {
      gradient?: false | undefined;
      matrixOverlay?: never;
    }
  | {
      gradient: GradientVariant;
      matrixOverlay?: false | MatrixOverlayVariant;
    };

export function Background({ gradient, matrixOverlay }: BackgroundProps) {
  const { theme } = useTheme();
  const matrixColor =
    matrixOverlay === 'colored'
      ? withHexOpacity(theme.palette.primary_500, '10')
      : withHexOpacity(theme.palette.neutral_500, '10');

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.palette.background_primary },
        ]}
      />
      {gradient ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: theme.palette.background_secondary,
              opacity: gradient === 'surround' ? 0.18 : 0.12,
            },
          ]}
        />
      ) : null}
      {gradient === 'surround' ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: theme.palette.primary_950,
              opacity: 0.24,
            },
          ]}
        />
      ) : null}
      {gradient && matrixOverlay ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: matrixColor,
              opacity: 0.4,
            },
          ]}
        />
      ) : null}
    </View>
  );
}
