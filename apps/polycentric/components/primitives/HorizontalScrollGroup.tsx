import { ScrollView, StyleSheet } from 'react-native';
import { useLegacyTheme } from '@/legacyTheme';

interface HorizontalScrollGroupProps {
  children: React.ReactNode;
}

export function HorizontalScrollGroup({
  children,
}: HorizontalScrollGroupProps) {
  const { legacyTheme } = useLegacyTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[
        styles.container,
        { gap: legacyTheme.spacing.sm },
      ]}
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
