import { List } from '@/src/common/components/List';
import { Spacing } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import type { ReactElement } from 'react';
import { RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DecodedClaim } from '../hooks/useClaimById';
import { ClaimActionRow } from './ClaimActionRow';
import { ClaimListItem } from './ClaimListItem';
import { ClaimSkeletonList } from './ClaimSkeleton';

type ClaimListProps = {
  claims: DecodedClaim[];
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  /** Leads the list with a "Create new claim" row when given. */
  onCreateClaim?: () => void;
  empty?: ReactElement | null;
};

/** A scrollable list of verification claims. */
export function ClaimList({
  claims,
  isLoading,
  isRefreshing,
  onRefresh,
  onCreateClaim,
  empty,
}: ClaimListProps) {
  const insets = useSafeAreaInsets();

  return (
    <List<DecodedClaim>
      data={claims}
      keyExtractor={(claim) =>
        `${claim.identity}-${claim.keyFingerprint}-${claim.sequence}`
      }
      renderItem={({ item }) => <ClaimListItem claim={item} />}
      ListHeaderComponent={
        onCreateClaim && claims.length > 0 ? (
          <ClaimActionRow
            title="Create new claim"
            subtitle="Invite others to vouch for your claims & credentials."
            onPress={onCreateClaim}
          />
        ) : null
      }
      ListEmptyComponent={isLoading ? <ClaimSkeletonList /> : empty}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        )
      }
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    />
  );
}
