import { StyleSheet } from 'react-native';
import { View, useWindowDimensions } from 'react-native';
import {
  Canvas,
  RadialGradient,
  vec,
  Rect,
  Group,
  Circle,
} from '@shopify/react-native-skia';
import { useTheme } from '@/theme';

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
  const layers: React.ReactNode[] = [<SolidLayer key="solid" />];

  if (gradient) {
    layers.push(<GradientLayer key="gradient" gradient={gradient} />);

    if (matrixOverlay) {
      layers.push(<MatrixOverlay key="matrix" matrixOverlay={matrixOverlay} />);
    }
  }

  return <View style={StyleSheet.absoluteFill}>{layers}</View>;
}

function SolidLayer() {
  const { theme } = useTheme();

  const styles = StyleSheet.create({
    solidBackground: {
      backgroundColor: theme.colors.backgroundPrimary,
    },
  });

  return <View style={[StyleSheet.absoluteFill, styles.solidBackground]} />;
}

function GradientLayer({ gradient }: { gradient: GradientVariant }) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={width} height={width}>
        <RadialGradient
          c={vec(0, width * -0.2)}
          r={width}
          colors={[
            theme.colors.backgroundSecondary,
            theme.colors.backgroundPrimary,
          ]}
        />
      </Rect>
      {gradient === 'surround' && (
        <Rect x={0} y={height - width} width={width} height={width}>
          <RadialGradient
            c={vec(width * 0.75, height * 1.25)}
            r={width}
            colors={[
              theme.colors.backgroundSecondary,
              theme.colors.backgroundPrimary,
            ]}
          />
        </Rect>
      )}
    </Canvas>
  );
}

function MatrixOverlay({
  matrixOverlay,
}: {
  matrixOverlay: MatrixOverlayVariant;
}) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();

  const dotColor =
    matrixOverlay === 'neutral'
      ? theme.colors.neutralSurface
      : theme.colors.primary;

  const patternWidth = width;
  const patternHeight = height * 0.5;

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Group>
        <DotPattern
          width={patternWidth}
          height={patternHeight}
          dotColor={dotColor}
        />
      </Group>
    </Canvas>
  );
}

function DotPattern({
  width,
  height,
  dotColor,
}: {
  width: number;
  height: number;
  dotColor: string;
}) {
  const dotSpacing = 20;
  const dotRadius = 1;

  let baseR: string, baseG: string, baseB: string;

  const rgbaMatch = dotColor.match(/rgba?\(([^)]+)\)/);
  if (rgbaMatch) {
    const colorParts = rgbaMatch[1].split(',').map((s) => s.trim());
    baseR = colorParts[0];
    baseG = colorParts[1];
    baseB = colorParts[2];
  } else if (dotColor.startsWith('#')) {
    const hex = dotColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    baseR = r.toString();
    baseG = g.toString();
    baseB = b.toString();
  } else {
    return null;
  }

  const dots = [];
  for (let x = dotSpacing; x < width; x += dotSpacing) {
    for (let y = dotSpacing; y < height; y += dotSpacing) {
      const normalizedX = x / width;
      const normalizedY = y / height;
      const diagonalPosition = (normalizedX + normalizedY) / 2;
      const opacity = 1 - diagonalPosition * 1.2;

      if (opacity <= 0) continue;

      dots.push(
        <Circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={dotRadius}
          color={`rgba(${baseR}, ${baseG}, ${baseB}, ${opacity * 0.3})`}
        />,
      );
    }
  }

  return <Group>{dots}</Group>;
}
