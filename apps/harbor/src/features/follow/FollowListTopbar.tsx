import { Text } from '@/src/common/components';
import Topbar from '@/src/common/components/layout/Topbar';
import {
  shortenIdentityId,
  truncateName,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { View } from 'react-native';

/** Names whose follow lists these are. Shared by both pages, so it sits above
 *  the tab bar rather than inside either list. */
export function FollowListTopbar({ identityId }: { identityId?: string }) {
  const fallbackUsername = useUsername(identityId ?? null);
  const profile = useProfile(identityId ?? null);
  const username = truncateName(profile.name ?? fallbackUsername, 24);

  return (
    <Topbar
      center={
        <View style={Atoms.align_center}>
          <Text variant="title" numberOfLines={1}>
            {username}
          </Text>
          <Text variant="small" color="neutral_500" numberOfLines={1}>
            {identityId ? shortenIdentityId(identityId) : ''}
            {profile.alias ? ` · ${profile.alias}` : ''}
          </Text>
        </View>
      }
    />
  );
}
