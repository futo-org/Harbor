import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/common/components/primitives';
import { BackButton } from '../composites/BackButton';
import { CloseButton } from '../composites/CloseButton';
import { Atoms } from '@/src/common/theme';

interface ScreenHeaderProps {
  title?: string;
  onBack?: () => void;
  onClose?: () => void;
}

// TODO: use swiftUI of buttons
export function ScreenHeader({ title, onBack, onClose }: ScreenHeaderProps) {
  return (
    <View style={[styles.container, Atoms.mt_xl, Atoms.mb_xl]}>
      <View style={[styles.left, Atoms.mt_xs]}>
        {onBack && <BackButton onPress={onBack} />}
      </View>
      <View style={styles.center}>
        {title && (
          <Text variant="subtitle" numberOfLines={1}>
            {title}
          </Text>
        )}
      </View>
      <View style={[styles.right, Atoms.mt_xs]}>
        {onClose && <CloseButton onPress={onClose} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  left: {
    flex: 1,
    alignItems: 'flex-start',
  },
  center: {
    flex: 2,
    alignItems: 'center',
  },
  right: {
    flex: 1,
    alignItems: 'flex-end',
  },
});
