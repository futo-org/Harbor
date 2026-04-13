import { TAB_BAR_HEIGHT } from '@/src/common/constants';
import { ToastProvider } from '@/src/common/lib/toast';
import type { Theme } from '@/src/common/theme';
import { Atoms, useTheme } from '@/src/common/theme';
import {
  WideShell,
  WideShellMode,
  useWideShellMode,
} from '@/src/features/wideshell';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

const ICON_SIZE = 20;

const stackOnlyTabOptions = {
  href: null,
} as const;

const hiddenTabBarStyle = {
  display: 'none' as const,
  height: 0,
  overflow: 'hidden' as const,
};

const visibleTabBarStyle = {
  position: 'absolute' as const,
  borderTopWidth: 0,
  backgroundColor: 'transparent',
  elevation: 0,
  height: TAB_BAR_HEIGHT,
  paddingTop: 8,
} satisfies NonNullable<BottomTabNavigationOptions['tabBarStyle']>;

function TabBarBackground() {
  const { theme } = useTheme();

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: theme.palette.background_secondary },
      ]}
    />
  );
}

function getBottomTabBarScreenOptions({
  theme,
  hideTabBar,
}: {
  theme: Theme;
  hideTabBar: boolean;
}): BottomTabNavigationOptions {
  return {
    headerShown: false,
    tabBarShowLabel: false,
    tabBarActiveTintColor: theme.palette.primary_500,
    tabBarInactiveTintColor: theme.palette.neutral_500,
    tabBarBackground: () => <TabBarBackground />,
    tabBarStyle: hideTabBar ? hiddenTabBarStyle : visibleTabBarStyle,
  };
}

type TabsNavigatorProps = {
  hideTabBar: boolean;
};

function TabsNavigator({ hideTabBar }: TabsNavigatorProps) {
  const { theme } = useTheme();

  return (
    <Tabs screenOptions={getBottomTabBarScreenOptions({ theme, hideTabBar })}>
      <Tabs.Screen
        name="feed"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="home-outline" size={ICON_SIZE} color={color} />
          ),
        }}
      />
      {/* TODO: re-enable when ready */}
      <Tabs.Screen name="search" options={stackOnlyTabOptions} />
      <Tabs.Screen name="claims" options={stackOnlyTabOptions} />
      <Tabs.Screen name="activity" options={stackOnlyTabOptions} />
      <Tabs.Screen name="profile" options={stackOnlyTabOptions} />
      <Tabs.Screen name="post" options={stackOnlyTabOptions} />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="settings-outline" size={ICON_SIZE} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabsLayoutScreen() {
  const wideShellMode = useWideShellMode();
  const useWideShell = wideShellMode !== WideShellMode.Narrow;

  return useWideShell ? (
    <WideShell>
      <TabsNavigator hideTabBar />
    </WideShell>
  ) : (
    <View style={[Atoms.flex_1, Atoms.w_full, Atoms.min_w_0]}>
      <ToastProvider>
        <TabsNavigator hideTabBar={false} />
      </ToastProvider>
    </View>
  );
}
