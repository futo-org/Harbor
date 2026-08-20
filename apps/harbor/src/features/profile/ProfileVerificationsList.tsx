import { List } from '@/src/common/components/List';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { Spacing } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { ClaimActionRow } from '@/src/features/verifications/claims/ClaimActionRow';
import { ClaimCreateSheet } from '@/src/features/verifications/claims/create/ClaimCreateSheet';
import { ClaimListItem } from '@/src/features/verifications/claims/ClaimListItem';
import { ClaimSkeletonList } from '@/src/features/verifications/claims/ClaimSkeleton';
import type { DecodedClaim } from '@/src/features/verifications/hooks/useClaimById';
import { useClaimsList } from '@/src/features/verifications/hooks/useClaimsList';
import { useState } from 'react';
import { RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfileContext } from './ProfileContext';

// The profile's Verifications tab: the claims the identity has made.
export function ProfileVerificationsList({
  active = true,
}: {
  /** True for the page being shown; only that page loads. */
  active?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { identityKey, isSelf } = useProfileContext();
  const claims = useClaimsList(identityKey ?? undefined, active);

  const [requestOpen, setRequestOpen] = useState(false);

  return (
    <>
      <List<DecodedClaim>
        data={claims.claims}
        keyExtractor={(claim) =>
          `${claim.identity}-${claim.keyFingerprint}-${claim.sequence}`
        }
        renderItem={({ item }) => <ClaimListItem claim={item} />}
        // Requesting a verification is meaningless on your own profile.
        ListHeaderComponent={
          !isSelf && identityKey ? (
            <ClaimActionRow
              title="Request a verification"
              onPress={() => setRequestOpen(true)}
            />
          ) : null
        }
        ListEmptyComponent={
          claims.isLoading ? (
            <ClaimSkeletonList count={3} />
          ) : (
            <ListEmpty>
              {isSelf
                ? "You haven't created any verification claims yet."
                : 'No claims yet.'}
            </ListEmpty>
          )
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl
              refreshing={claims.isRefreshing}
              onRefresh={claims.refresh}
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />

      {!isSelf && identityKey && (
        <ClaimCreateSheet
          open={requestOpen}
          onClose={() => setRequestOpen(false)}
          requestFrom={identityKey}
        />
      )}
    </>
  );
}
