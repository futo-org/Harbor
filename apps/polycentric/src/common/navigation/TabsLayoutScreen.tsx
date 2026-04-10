import { TAB_BAR_HEIGHT } from '@/src/common/constants';
import { useTheme } from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

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
