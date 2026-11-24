import { Atoms, Spacing } from '@/src/common/theme';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppFooter } from '../../AppFooter';
import { NavDrawerDivider } from './NavDrawerDivider';
import { NavDrawerHeader } from './NavDrawerHeader';
import { VerticalNav } from '../VerticalNav';

export function NavDrawerContent() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        Atoms.justify_between,
        {
          minHeight: '100%',
          paddingHorizontal: Spacing.md,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom * 0.75, Spacing.md),
        },
      ]}
    >
      <View style={{ gap: Spacing.lg }}>
        <NavDrawerHeader />
        <NavDrawerDivider />
        <VerticalNav showLabels large />
      </View>
      <View style={{ gap: Spacing.lg, paddingTop: Spacing['2xl'] }}>
        <NavDrawerDivider />
        <AppFooter
          style={[Atoms.px_lg, { columnGap: Spacing.lg, rowGap: Spacing.sm }]}
        />
      </View>
    </ScrollView>
  );
}
