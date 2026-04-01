import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import { TAB_BAR_HEIGHT } from '@/constants';
import { useLegacyTheme } from '@/legacyTheme';

function TabBarBackground() {
  return (
    <BlurView
      intensity={20}
      tint="systemThickMaterialDark"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: 'rgba(2, 4, 8, 0.82)' },
      ]}
    />
  );
}

const ICON_SIZE = 20;

export default function TabLayout() {
  const { legacyTheme } = useLegacyTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: legacyTheme.colors.primary,
        tabBarInactiveTintColor: legacyTheme.colors.neutralSurface,
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
