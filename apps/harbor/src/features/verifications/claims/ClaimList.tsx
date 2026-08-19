import { List } from '@/src/common/components/List';
import { Spacing } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { type ReactElement, useMemo } from 'react';
import { RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DecodedClaim } from '../hooks/useClaimById';
import { ClaimActionRow } from './ClaimActionRow';
import { ClaimListItem } from './ClaimListItem';

type ClaimListProps = {
  claims: DecodedClaim[];
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  /** Own claims need not name the owner. */
  showOwner: boolean;
  /** Leads the list with a "Create new claim" row when given. */
  onCreateClaim?: () => void;
  empty?: ReactElement | null;
};

// The outbox leads with a "Create new claim" action row.
type Row = { kind: 'create' } | { kind: 'claim'; claim: DecodedClaim };

/** A scrollable list of verification claims. */
export function ClaimList({
  claims,
  isLoading,
  isRefreshing,
  onRefresh,
  showOwner,
  onCreateClaim,
  empty,
}: ClaimListProps) {
  const insets = useSafeAreaInsets();

  const rows = useMemo<Row[]>(() => {
    const claimRows = claims.map((claim) => ({
      kind: 'claim' as const,
      claim,
    }));
    return onCreateClaim ? [{ kind: 'create' }, ...claimRows] : claimRows;
  }, [claims, onCreateClaim]);

  return (
    <List<Row>
      data={rows}
      keyExtractor={(row) =>
        row.kind === 'create'
          ? 'create'
          : `${row.claim.identity}-${row.claim.keyFingerprint}-${row.claim.sequence}`
      }
      getItemType={(row) => row.kind}
      renderItem={({ item }) =>
        item.kind === 'create' && onCreateClaim ? (
          <ClaimActionRow
            title="Create new claim"
            subtitle="Invite others to vouch for your claims & credentials."
            onPress={onCreateClaim}
          />
        ) : item.kind === 'claim' ? (
          <ClaimListItem claim={item.claim} showOwner={showOwner} />
        ) : null
      }
      // Suppress the empty state during the initial load so it doesn't flash.
      ListEmptyComponent={isLoading ? null : empty}
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
