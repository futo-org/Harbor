import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/primitives';
import { TAB_BAR_HEIGHT } from '@/constants';

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
  return (
    <View style={styles.container}>
      <Button
        onPress={onPress}
        title={title}
        variant="primary"
        size="md"
        icon={icon}
        style={{
          boxShadow: '-1px -2px 12px rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          paddingVertical: 9,
          paddingHorizontal: 14,
        }}
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
