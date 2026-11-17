import {
  type IconName,
  type IconRenderFn,
  renderIcon,
} from '@/src/common/components/Icon';
import { Button } from '@/src/common/components/primitives';
import { TAB_BAR_HEIGHT } from '@/src/common/constants';
import { isIOS } from '@/src/common/util/platform';
import { Atoms, useTheme } from '@/src/common/theme';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Pressable, View } from 'react-native';

const GLASS = isIOS && isLiquidGlassAvailable();
const GLASS_SIZE = 56;

interface FabProps {
  onPress: () => void;
  icon: IconName | IconRenderFn;
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
          tintColor={theme.colors.accent}
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
            {renderIcon(icon, { size: 32, color: 'light' })}
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
          style={theme.scheme === 'light' && Atoms.border_0}
        />
      )}
    </View>
  );
}
