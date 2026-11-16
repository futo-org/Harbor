import { Button } from '@/src/common/components/primitives';
import { TAB_BAR_HEIGHT } from '@/src/common/constants';
import { isIOS } from '@/src/common/util/platform';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, Pressable, View } from 'react-native';

const GLASS = isIOS && isLiquidGlassAvailable();
const GLASS_SIZE = 56;

type IconRenderFn = (props: {
  size: number;
  color: string;
  style?: object;
}) => React.ReactNode;

interface FabProps {
  onPress: () => void;
  icon: IconRenderFn;
  title?: string;
  accessibilityLabel?: string;
}

export function Fab({
  onPress,
  icon,
  title = '',
  accessibilityLabel,
}: FabProps) {
  const { theme } = useTheme();
  const isLight = theme.scheme === 'light';
  const shadow =
    Platform.OS === 'web'
      ? {
          boxShadow: `0 6px 16px ${withHexOpacity(
            theme.palette.primary_900,
            isLight ? '28' : '40',
          )}`,
        }
      : {
          shadowColor: theme.palette.primary_900,
          shadowOpacity: isLight ? 0.16 : 0.26,
          shadowRadius: isLight ? 14 : 10,
          shadowOffset: { width: 0, height: isLight ? 3 : 4 },
          elevation: isLight ? 4 : 6,
        };

  return (
    <View
      style={[
        Atoms.absolute,
        { bottom: isIOS ? TAB_BAR_HEIGHT : 0, right: 0 },
        Atoms.p_lg,
      ]}
    >
      {GLASS ? (
        <GlassView
          isInteractive
          tintColor={theme.palette.primary_500}
          colorScheme={theme.scheme}
          style={{
            width: GLASS_SIZE,
            height: GLASS_SIZE,
            borderRadius: GLASS_SIZE / 2,
          }}
        >
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={[Atoms.flex_1, Atoms.align_center, Atoms.justify_center]}
          >
            {icon({ size: 32, color: 'white' })}
          </Pressable>
        </GlassView>
      ) : (
        <Button
          onPress={onPress}
          title={title}
          accessibilityLabel={accessibilityLabel}
          variant="primary"
          size="md"
          icon={icon}
          style={[
            shadow,
            isLight && {
              borderWidth: 0,
            },
          ]}
        />
      )}
    </View>
  );
}
