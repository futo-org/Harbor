import { View, StyleSheet } from 'react-native';
import { useLegacyTheme } from '@/legacyTheme';
import { Ionicons } from '@expo/vector-icons';

const SIZE = 20;

export function SelectionIndicator() {
  const { legacyIsDark, legacyTheme } = useLegacyTheme();

  return (
    <View
      style={[
        styles.indicator,
        { backgroundColor: legacyTheme.colors.primary },
      ]}
    >
      <Ionicons
        name="checkmark-sharp"
        size={16}
        color={
          legacyIsDark ? legacyTheme.colors.black : legacyTheme.colors.white
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  indicator: {
    width: SIZE,
    height: SIZE,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
