import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/src/common/theme';
import Icon from '@/src/common/components/Icon';

const SIZE = 20;

export function SelectionIndicator() {
  const { theme } = useTheme();
  const isDark = theme.scheme === 'dark';

  return (
    <View
      style={[styles.indicator, { backgroundColor: theme.palette.primary_500 }]}
    >
      <Icon
        name="checkmarkSharp"
        size={16}
        color={isDark ? 'black' : 'white'}
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
