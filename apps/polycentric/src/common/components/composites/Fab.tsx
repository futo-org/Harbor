import { Button } from '@/src/common/components/primitives';
import { TAB_BAR_HEIGHT } from '@/src/common/constants';
import { useTheme, withHexOpacity } from '@/src/common/theme';
import { Platform, StyleSheet, View } from 'react-native';

type IconRenderFn = (props: {
  size: number;
  color: string;
  style?: object;
}) => React.ReactNode;

interface FabProps {
  onPress: () => void;
  icon: IconRenderFn;
  title?: string;
}

export function Fab({ onPress, icon, title = '' }: FabProps) {
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
    <View style={styles.container}>
      <Button
        onPress={onPress}
        title={title}
        variant="primary"
        size="md"
        icon={icon}
        style={[
          {
            zIndex: 1000,
            paddingVertical: 9,
            paddingHorizontal: 14,
          },
          shadow,
          isLight && {
            borderWidth: 0,
          },
        ]}
      />
    </View>
  );
}

const GAP_ABOVE_TAB_BAR = 8;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: TAB_BAR_HEIGHT + GAP_ABOVE_TAB_BAR,
    right: 24,
  },
});
