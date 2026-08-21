import { Tabs } from '@/src/common/components/tabs';
import type { SharedValue } from 'react-native-reanimated';
import { useProfileContext } from './ProfileContext';

/** Shared by the full and compact profile headers. */
export function ProfileTabs({
  progress,
}: {
  /** The pager's swipe position, so the indicator tracks the drag. */
  progress?: SharedValue<number>;
}) {
  const { activeFeed, setActiveFeed } = useProfileContext();

  return (
    <Tabs progress={progress}>
      <Tabs.Tab
        active={activeFeed === 'posts'}
        onPress={() => setActiveFeed('posts')}
      >
        Posts
      </Tabs.Tab>
      <Tabs.Tab
        active={activeFeed === 'verification-claims'}
        onPress={() => setActiveFeed('verification-claims')}
      >
        Verifications Claimed
      </Tabs.Tab>
      <Tabs.Tab
        active={activeFeed === 'verification-verifies'}
        onPress={() => setActiveFeed('verification-verifies')}
      >
        Verifications Vouched
      </Tabs.Tab>
    </Tabs>
  );
}
