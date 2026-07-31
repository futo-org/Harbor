import { ScrollView, StyleSheet } from 'react-native';
import { Atoms } from '@/src/common/theme';

interface HorizontalScrollGroupProps {
  children: React.ReactNode;
}

export function HorizontalScrollGroup({
  children,
}: HorizontalScrollGroupProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.container, Atoms.gap_sm]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
