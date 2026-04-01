import { StyleSheet, View } from 'react-native';
import { useLegacyTheme } from '@/legacyTheme';

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
  const { legacyTheme } = useLegacyTheme();
  const matrixColor =
    matrixOverlay === 'colored'
      ? legacyTheme.colors.primaryOpacity10
      : legacyTheme.colors.neutralSurfaceOpacity10;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: legacyTheme.colors.backgroundPrimary },
        ]}
      />
      {gradient ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: legacyTheme.colors.backgroundSecondary,
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
              backgroundColor: legacyTheme.colors.primaryDarkestOpacity10,
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
