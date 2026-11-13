import type { IconName, IconRenderFn } from '@/src/common/components/Icon';
import { Button } from '@/src/common/components/primitives';
import { Atoms, useTheme } from '@/src/common/theme';
import { View } from 'react-native';

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
    <View style={[Atoms.absolute, { bottom: 0, right: 0 }, Atoms.p_lg]}>
      <Button
        onPress={onPress}
        title={title}
        accessibilityLabel={accessibilityLabel}
        variant="primary"
        size="md"
        icon={icon}
        style={theme.scheme === 'light' && { borderWidth: 0 }}
      />
    </View>
  );
}
