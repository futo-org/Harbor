import { List } from '@/src/common/components/List';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { Spacing } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { ClaimListItem } from '@/src/features/verifications/claims/ClaimListItem';
import { ClaimSkeletonList } from '@/src/features/verifications/claims/ClaimSkeleton';
import { useRequestedVerifications } from '@/src/features/verifications/hooks/useRequestedVerifications';
import type { ClaimWithStatus } from '@/src/features/verifications/utils/claim-status';
import { useMemo, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfileContext } from './ProfileContext';
import { ClaimCreateSheet } from '@/src/features/verifications/claims/create/ClaimCreateSheet';
import { ClaimActionRow } from '../verifications/claims/ClaimActionRow';

/**
 * The profile's Verifies tab: claims by others that the identity verified.
 * Every verify follows a request aimed at the identity (verifier bots
 * included, as claims are targeted at all configured bots up front), so the
 * requests aimed at it, filtered to the verified ones, are the verifies.
 */
export function ProfileVerifiesList({
  active = true,
}: {
  /** True for the page being shown; only that page loads. */
  active?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { identityKey, isSelf } = useProfileContext();

  const requested = useRequestedVerifications(identityKey ?? undefined, active);

  const [requestOpen, setRequestOpen] = useState(false);

  const verified = useMemo(
    () =>
      requested.claims.filter((claim) =>
        claim.status.verifiers.some(
          (row) => row.identity === identityKey && row.verified,
        ),
      ),
    [requested.claims, identityKey],
  );

  return (
    <>
      <List<ClaimWithStatus>
        data={verified}
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
