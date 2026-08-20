import { List } from '@/src/common/components/List';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { Spacing } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { ClaimListItem } from '@/src/features/verifications/claims/ClaimListItem';
import {
  ClaimSkeleton,
  ClaimSkeletonList,
} from '@/src/features/verifications/claims/ClaimSkeleton';
import { useClaimById } from '@/src/features/verifications/hooks/useClaimById';
import { useClaimVerifiers } from '@/src/features/verifications/hooks/useClaimVerifiers';
import {
  useVerifies,
  type VerifiedClaimKey,
} from '@/src/features/verifications/hooks/useVerifies';
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
  const verified = useVerifies(identityKey ?? undefined, active);

  return (
    <List<VerifiedClaimKey>
      data={verified.verifies}
      keyExtractor={(verify) => verify.id}
      renderItem={({ item }) => <VerifiedClaimRow verify={item} />}
      ListEmptyComponent={
        verified.isLoading ? (
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
            refreshing={verified.isRefreshing}
            onRefresh={verified.refresh}
          />
        )
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

/** A verify names only the claim's key; the claim and status load here. */
function VerifiedClaimRow({ verify }: { verify: VerifiedClaimKey }) {
  const { claim, isLoading } = useClaimById(
    verify.identity,
    verify.keyFingerprint,
    verify.sequence,
  );
  const { verifiers, verifiedCount, totalCount } = useClaimVerifiers(claim?.id);

  if (claim) {
    return (
      <ClaimListItem
        claim={{ ...claim, status: { verifiers, verifiedCount, totalCount } }}
      />
    );
  }
  return isLoading ? <ClaimSkeleton /> : null;
}
