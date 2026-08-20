import { Button, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { PagerView } from '@/src/common/components/PagerView';
import { Tabs } from '@/src/common/components/Tabs';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useFocusEffect } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { ClaimList } from './claims/ClaimList';
import { ClaimCreateSheet } from './claims/create/ClaimCreateSheet';
import { useClaimsList } from './hooks/useClaimsList';
import { useRequestedVerifications } from './hooks/useRequestedVerifications';

// Outbox: claims the current identity created. Inbox: claims others have
// asked the current identity to verify.
type ClaimsTab = 'inbox' | 'outbox';

/** Page order behind the tab bar. */
const CLAIMS_TABS: readonly ClaimsTab[] = ['inbox', 'outbox'];
const CLAIMS_TAB_LABELS: Record<ClaimsTab, string> = {
  inbox: 'Inbox',
  outbox: 'Outbox',
};

type PageProps = {
  /** True for the page being shown; only that page loads. */
  active: boolean;
  /** False until the screen is allowed to start fetching at all. */
  ready: boolean;
};

function InboxPage({ active, ready }: PageProps) {
  const { identityKey } = useCurrentIdentity();
  const inbox = useRequestedVerifications(
    identityKey ?? undefined,
    ready && active,
  );

  return (
    <ClaimList
      claims={inbox.claims}
      // A page nobody has opened has nothing to show and is not fetching, so it
      // holds its peace rather than claiming the inbox is empty.
      isLoading={inbox.isLoading || (!active && inbox.claims.length === 0)}
      isRefreshing={inbox.isRefreshing}
      onRefresh={inbox.refresh}
      empty={
        <ListEmpty>
          <View style={[Atoms.items_center, Atoms.gap_lg]}>
            <Text variant="body" color="neutral_500" style={Atoms.text_center}>
              When someone asks you to verify a claim, it will show up here.
            </Text>
          </View>
        </ListEmpty>
      }
    />
  );
}

function OutboxPage({
  active,
  ready,
  onCreateClaim,
}: PageProps & { onCreateClaim: () => void }) {
  const { identityKey } = useCurrentIdentity();
  const outbox = useClaimsList(identityKey ?? undefined, ready && active);

  return (
    <ClaimList
      claims={outbox.claims}
      isLoading={outbox.isLoading}
      isRefreshing={outbox.isRefreshing}
      onRefresh={outbox.refresh}
      onCreateClaim={onCreateClaim}
      empty={
        <ListEmpty>
          <View style={[Atoms.items_center, Atoms.gap_lg]}>
            <Text variant="body" color="neutral_500" style={Atoms.text_center}>
              You haven't made any claims yet
            </Text>
            <Button
              title="Create a claim"
              variant="primary"
              icon="verify"
              onPress={onCreateClaim}
            />
          </View>
        </ListEmpty>
      }
    />
  );
}

export default function VerificationsScreen() {
  usePageTitle('Verifications');

  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<ClaimsTab>('outbox');

  // Tabs mount eagerly; don't fetch until the tab is first focused.
  const [ready, setReady] = useState(false);
  useFocusEffect(() => {
    setReady(true);
  });

  const renderTabBar = ({
    dragProgress,
  }: {
    dragProgress: SharedValue<number>;
  }) => (
    <>
      <Topbar
        title="Verifications"
        left={isWeb ? <></> : undefined}
        right={<CreateClaimButton onPress={() => setCreateOpen(true)} />}
      />
      <Tabs progress={dragProgress}>
        {CLAIMS_TABS.map((value) => (
          <Tabs.Tab
            key={value}
            active={tab === value}
            onPress={() => setTab(value)}
          >
            {CLAIMS_TAB_LABELS[value]}
          </Tabs.Tab>
        ))}
      </Tabs>
    </>
  );

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <PagerView
          values={CLAIMS_TABS}
          active={tab}
          onChange={setTab}
          renderTabBar={renderTabBar}
        >
          <InboxPage active={tab === 'inbox'} ready={ready} />
          <OutboxPage
            active={tab === 'outbox'}
            ready={ready}
            onCreateClaim={() => setCreateOpen(true)}
          />
        </PagerView>
        <ClaimCreateSheet
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      </Screen.PrimaryColumn>
    </Screen>
  );
}

function CreateClaimButton({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create a claim"
      onPress={onPress}
      hitSlop={Spacing.lg}
      style={({ pressed }) => [
        Atoms.p_xs,
        Atoms.rounded_full,
        pressed && { backgroundColor: theme.palette.neutral_25 },
      ]}
    >
      <Icon name="add" size={24} color="neutral_800" />
    </Pressable>
  );
}
