import { Tabs } from '@/src/common/components/Tabs';
import { useProfileContext } from './ProfileContext';

/** Shared by the full and compact profile headers. */
export function ProfileTabs() {
  const { activeFeed, setActiveFeed } = useProfileContext();

  return (
    <Tabs>
      <Tabs.Tab
        active={activeFeed === 'posts'}
        onPress={() => setActiveFeed('posts')}
      >
        Posts
      </Tabs.Tab>
      <Tabs.Tab
        active={activeFeed === 'verifications'}
        onPress={() => setActiveFeed('verifications')}
      >
        Verifications
      </Tabs.Tab>
    </Tabs>
  );
}
