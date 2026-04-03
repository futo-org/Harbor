import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import { TAB_BAR_HEIGHT } from '@/src/common/constants';
import { useTheme, withHexOpacity } from '@/src/common/theme';

function TabBarBackground() {
  const { theme } = useTheme();
  const isDark = theme.scheme === 'dark';

  return (
    <BlurView
      intensity={isDark ? 24 : 32}
      tint={isDark ? 'dark' : 'light'}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: withHexOpacity(
            theme.palette.background_primary,
            'CC',
          ),
        },
      ]}
    />
  );
}

const ICON_SIZE = 20;

export default function TabsLayoutScreen() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: theme.palette.primary_500,
        tabBarInactiveTintColor: theme.palette.neutral_500,
        tabBarBackground: () => <TabBarBackground />,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          elevation: 0,
          height: TAB_BAR_HEIGHT,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="home-outline" size={ICON_SIZE} color={color} />
          ),
        }}
      />
      {/* TODO: re-enable when ready */}
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="claims" options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
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
