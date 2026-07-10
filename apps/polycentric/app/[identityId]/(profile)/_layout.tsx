import { Atoms, useTheme } from '@/src/common/theme';
import { Tabs } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function ProfileTabsLayout() {
  const { theme } = useTheme();
  return (
    <Tabs
      backBehavior="none"
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        sceneStyle: [Atoms.flex_1, Atoms.overflow_auto, theme.atoms.bg],
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="verifications" />
    </Tabs>
  );
}
