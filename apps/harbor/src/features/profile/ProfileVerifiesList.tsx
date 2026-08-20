import { List } from '@/src/common/components/List';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { Spacing } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { ClaimListItem } from '@/src/features/verifications/claims/ClaimListItem';
import { ClaimSkeletonList } from '@/src/features/verifications/claims/ClaimSkeleton';
import { useRequestedVerifications } from '@/src/features/verifications/hooks/useRequestedVerifications';
import type { ClaimWithStatus } from '@/src/features/verifications/utils/claim-status';
import { useMemo } from 'react';
import { RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfileContext } from './ProfileContext';

// The profile's Verifies tab: claims by others that the identity verified.
export function ProfileVerifiesList({
  active = true,
}: {
  /** True for the page being shown; only that page loads. */
  active?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { identityKey, isSelf } = useProfileContext();
  const requested = useRequestedVerifications(identityKey ?? undefined, active);

  // The requests inbox, kept only where this identity's verify exists.
  const claims = useMemo(
    () =>
      requested.claims.filter((claim) =>
        claim.status.verifiers.some(
          (verifier) => verifier.identity === identityKey && verifier.verified,
        ),
      ),
    [requested.claims, identityKey],
  );

  return (
    <List<ClaimWithStatus>
      data={claims}
      keyExtractor={(claim) =>
        `${claim.identity}-${claim.keyFingerprint}-${claim.sequence}`
      }
      renderItem={({ item }) => <ClaimListItem claim={item} showOwner />}
      ListEmptyComponent={
        requested.isLoading ? (
          <ClaimSkeletonList count={3} />
        ) : (
          <ListEmpty>
            {isSelf
              ? "You haven't vouched for any claims yet."
              : 'No vouches yet.'}
          </ListEmpty>
        )
      }
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl
            refreshing={requested.isRefreshing}
            onRefresh={requested.refresh}
          />
        )
      }
      showsVerticalScrollIndicator={false}
    />
  );
}
