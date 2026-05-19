import { useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { Slot } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function TabsLayout() {
  const { theme } = useTheme();
  if (isWeb) {
    return <Slot />;
  }

  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      backgroundColor={theme.palette.neutral_0}
      iconColor={theme.palette.neutral_900}
      tintColor={theme.palette.neutral_900}
      indicatorColor={theme.palette.neutral_25}
      rippleColor={theme.palette.neutral_50}
      badgeBackgroundColor={theme.palette.primary_200}
    >
      <NativeTabs.Trigger name="feed">
        <NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bell.fill" md="notifications" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
