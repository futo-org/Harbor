import { Text } from '@/src/common/components';
import Topbar from '@/src/common/components/layout/Topbar';
import { shortenIdentityId } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { ProfileName } from '@/src/features/profile/ProfileName';
import { View } from 'react-native';

/** Names whose follow lists these are. Shared by both pages, so it sits above
 *  the tab bar rather than inside either list. */
export function FollowListTopbar({ identityId }: { identityId?: string }) {
  const profile = useProfile(identityId ?? null);

  return (
    <Topbar
      center={
        <View style={[Atoms.align_center, Atoms.flex_shrink_1, Atoms.min_w_0]}>
          {/* Centered children are content-sized; cap them so long names ellipsize. */}
          <View style={Atoms.max_w_full}>
            <ProfileName identity={identityId} variant="title" />
          </View>
          <Text
            variant="small"
            color="neutral_500"
            numberOfLines={1}
            style={Atoms.max_w_full}
          >
            {identityId ? shortenIdentityId(identityId) : ''}
            {profile.alias ? ` · ${profile.alias}` : ''}
          </Text>
        </View>
      }
    />
  );
}
