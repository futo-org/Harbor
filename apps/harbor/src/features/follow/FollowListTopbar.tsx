import Topbar from '@/src/common/components/layout/Topbar';
import { Atoms } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { IdentityHandle } from '@/src/features/profile/IdentityHandle';
import { Username } from '@/src/features/profile/Username';
import { FetchMode } from '@polycentric/react-native';
import { View } from 'react-native';

/** Names whose follow lists these are. Shared by both pages, so it sits above
 *  the tab bar rather than inside either list. */
export function FollowListTopbar({ identityId }: { identityId?: string }) {
  // Fetches the profile that `Username` and `IdentityHandle` read from the cache.
  useProfile(identityId ?? null, { fetchMode: FetchMode.Default });

  return (
    <Topbar
      center={
        <View style={[Atoms.align_center, Atoms.flex_shrink_1, Atoms.min_w_0]}>
          {/* Centered children are content-sized; cap them so long names ellipsize. */}
          <View style={Atoms.max_w_full}>
            <Username identity={identityId} variant="title" />
          </View>
          <IdentityHandle
            identity={identityId}
            variant="small"
            style={Atoms.max_w_full}
          />
        </View>
      }
    />
  );
}
