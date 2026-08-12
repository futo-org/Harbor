import { Button, Text } from '@/src/common/components';
import { List, type ListRef } from '@/src/common/components/List';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { Tabs } from '@/src/common/components/Tabs';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import {
  type ComponentType,
  forwardRef,
  type ReactElement,
  useMemo,
  useState,
} from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DecodedClaim } from '../hooks/useClaimById';
import { useClaimsList } from '../hooks/useClaimsList';
import { useRequestedVerifications } from '../hooks/useRequestedVerifications';
import { ClaimActionRow } from './ClaimActionRow';
import { ClaimListItem } from './ClaimListItem';

type ClaimListProps = {
  // Sticky hiding header (e.g. the Topbar).
  HeaderComponent?: ComponentType<unknown> | ReactElement | null;
  // Opens the create-claim sheet (the outbox's "Create new claim" row).
  onCreateClaim: () => void;
  // Set to false to defer fetching (e.g. until the tab is focused).
  enabled?: boolean;
};

// Outbox: claims the current identity created. Inbox: claims others have
// asked the current identity to verify.
type ClaimsTab = 'inbox' | 'outbox';

// The outbox leads with a "Create new claim" action row.
type Row = { kind: 'create' } | { kind: 'claim'; claim: DecodedClaim };

// The verifications screen's list, split into Inbox/Outbox tabs. Owns the
// scroll + pull-to-refresh; the tab bar rides along as a list header.
export const ClaimList = forwardRef<ListRef, ClaimListProps>(function ClaimList(
  { HeaderComponent, onCreateClaim, enabled = true },
  ref,
) {
  const insets = useSafeAreaInsets();
  const { identityKey } = useCurrentIdentity();
  const [tab, setTab] = useState<ClaimsTab>('outbox');

  const outbox = useClaimsList(identityKey ?? undefined, enabled);
  const inbox = useRequestedVerifications(identityKey ?? undefined, enabled);
  const active = tab === 'outbox' ? outbox : inbox;

  const rows = useMemo<Row[]>(() => {
    const claims = active.claims.map((claim) => ({
      kind: 'claim' as const,
      claim,
    }));
    return tab === 'outbox' ? [{ kind: 'create' }, ...claims] : claims;
  }, [active.claims, tab]);

  const refresh = () => {
    outbox.refresh();
    inbox.refresh();
  };

  return (
    <List<Row>
      ref={ref}
      HeaderComponent={HeaderComponent}
      ListHeaderComponent={
        <Tabs>
          <Tabs.Tab active={tab === 'inbox'} onPress={() => setTab('inbox')}>
            Inbox
          </Tabs.Tab>
          <Tabs.Tab active={tab === 'outbox'} onPress={() => setTab('outbox')}>
            Outbox
          </Tabs.Tab>
        </Tabs>
      }
      data={rows}
      keyExtractor={(row) =>
        row.kind === 'create'
          ? 'create'
          : `${row.claim.identity}-${row.claim.keyFingerprint}-${row.claim.sequence}`
      }
      getItemType={(row) => row.kind}
      renderItem={({ item }) =>
        item.kind === 'create' ? (
          <ClaimActionRow
            title="Create new claim"
            subtitle="Invite others to vouch for your claims & credentials."
            onPress={onCreateClaim}
          />
        ) : (
          <ClaimListItem claim={item.claim} showOwner={tab === 'inbox'} />
        )
      }
      ListEmptyComponent={
        // Only the inbox can be empty (the outbox always has the create
        // row). Suppress it during the initial load so it doesn't flash.
        active.isLoading ? null : (
          <ListEmpty>
            <View style={[Atoms.items_center, Atoms.gap_lg]}>
              <Text
                variant="body"
                color="neutral_500"
                style={Atoms.text_center}
              >
                When someone asks you to verify a claim, it will show up here.
              </Text>
              <Button
                title="Verify a claim"
                variant="primary"
                icon="verify"
                // TODO: start the claim verification flow once it exists.
                onPress={() => {}}
              />
            </View>
          </ListEmpty>
        )
      }
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl refreshing={active.isLoading} onRefresh={refresh} />
        )
      }
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    />
  );
});
