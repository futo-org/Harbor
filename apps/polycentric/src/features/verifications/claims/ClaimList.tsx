import { List, type ListRef } from '@/src/common/components/List';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { type ComponentType, forwardRef, type ReactElement } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DecodedClaim } from '../hooks/useClaimById';
import { useClaimsList } from '../hooks/useClaimsList';
import { ClaimListItem } from './ClaimListItem';

type ClaimListProps = {
  // Sticky hiding header (e.g. the Topbar).
  HeaderComponent?: ComponentType<unknown> | ReactElement | null;
  // Scrolls with the list (e.g. the create/verify controls).
  ListHeaderComponent?: ReactElement | null;
};

// The current identity's created claims. Owns the scroll + pull-to-refresh for
// the verifications screen; the create controls ride along as a list header.
export const ClaimList = forwardRef<ListRef, ClaimListProps>(function ClaimList(
  { HeaderComponent, ListHeaderComponent },
  ref,
) {
  const insets = useSafeAreaInsets();
  const { identityKey } = useCurrentIdentity();
  const { claims, isLoading, refresh } = useClaimsList(
    identityKey ?? undefined,
  );

  return (
    <List<DecodedClaim>
      ref={ref}
      HeaderComponent={HeaderComponent}
      ListHeaderComponent={ListHeaderComponent}
      data={claims}
      keyExtractor={(claim) => `${claim.keyFingerprint}-${claim.sequence}`}
      renderItem={({ item }) => <ClaimListItem claim={item} />}
      ListEmptyComponent={
        <ListEmpty>You haven&apos;t created any claims yet.</ListEmpty>
      }
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl refreshing={isLoading} onRefresh={refresh} />
        )
      }
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    />
  );
});
