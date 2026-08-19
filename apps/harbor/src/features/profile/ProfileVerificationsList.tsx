import { Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { List, SectionHeader } from '@/src/common/components/List';
import { truncateName, useUsername } from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { ClaimActionRow } from '@/src/features/verifications/claims/ClaimActionRow';
import { ClaimCreateSheet } from '@/src/features/verifications/claims/create/ClaimCreateSheet';
import { ClaimListItem } from '@/src/features/verifications/claims/ClaimListItem';
import type { DecodedClaim } from '@/src/features/verifications/hooks/useClaimById';
import { useClaimsList } from '@/src/features/verifications/hooks/useClaimsList';
import { useVerificationRequestsTo } from '@/src/features/verifications/hooks/useVerificationRequestsTo';
import { useVerifiedClaims } from '@/src/features/verifications/hooks/useVerifiedClaims';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile } from './hooks/useProfile';
import { useProfileContext } from './ProfileContext';

// Each section previews this many claims until "Show more" expands it.
const PREVIEW_COUNT = 3;

type SectionKey = 'requested' | 'verified';

type Row =
  | { kind: 'section'; key: string; title: string; tooltip: string }
  | { kind: 'claim'; key: string; claim: DecodedClaim }
  | { kind: 'empty'; key: string; message: string }
  | { kind: 'show-more'; key: string; section: SectionKey }
  // Create a claim and auto-request verification from this profile.
  | { kind: 'request'; key: string };

function sectionRows(
  section: SectionKey,
  title: string,
  tooltip: string,
  claims: DecodedClaim[],
  expanded: boolean,
  isLoading: boolean,
  emptyMessage: string,
): Row[] {
  const rows: Row[] = [
    { kind: 'section', key: `section-${section}`, title, tooltip },
  ];
  const visible = expanded ? claims : claims.slice(0, PREVIEW_COUNT);
  rows.push(
    ...visible.map((claim) => ({
      kind: 'claim' as const,
      key: `${section}-${claim.identity}-${claim.keyFingerprint}-${claim.sequence}`,
      claim,
    })),
  );
  if (claims.length > PREVIEW_COUNT && !expanded) {
    rows.push({ kind: 'show-more', key: `show-more-${section}`, section });
  }
  if (claims.length === 0 && !isLoading) {
    // Suppressed during the initial load so it doesn't flash.
    rows.push({
      kind: 'empty',
      key: `empty-${section}`,
      message: emptyMessage,
    });
  }
  return rows;
}

// The profile's Verifications tab: claims the identity has requested, and
// claims it has verified.
export function ProfileVerificationsList({
  active = true,
}: {
  /** True for the page being shown; only that page loads. */
  active?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { identityKey, isSelf } = useProfileContext();
  const requested = useClaimsList(identityKey ?? undefined, active);
  const verified = useVerifiedClaims(identityKey ?? undefined);
  // Verification requests the current identity has made to this profile.
  const pending = useVerificationRequestsTo(
    !isSelf ? (identityKey ?? undefined) : undefined,
  );

  // Display name for the request row's subtext.
  const fallbackUsername = useUsername(identityKey);
  const profile = useProfile(identityKey);
  const username = truncateName(profile.name ?? fallbackUsername, 24);

  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    requested: false,
    verified: false,
  });
  const [requestOpen, setRequestOpen] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    // Requesting a verification is meaningless on your own profile.
    if (!isSelf && identityKey) {
      out.push({ kind: 'request', key: 'request' });
    }
    out.push(
      ...sectionRows(
        'requested',
        'Claims',
        isSelf
          ? "Claims you've made about yourself for others to verify."
          : `Claims ${username} has made about themselves for others to verify.`,
        requested.claims,
        expanded.requested,
        requested.isLoading,
        isSelf
          ? "You haven't created any verification claims yet."
          : 'No verifications yet.',
      ),
      // Pending requests ride along here, marked by their "Not verified" chip.
      ...sectionRows(
        'verified',
        'Verified',
        isSelf
          ? 'Claims by others that you have verified.'
          : `Claims by others that ${username} has verified. Requests you've made to them appear here until verified.`,
        [...verified.claims, ...pending.claims],
        expanded.verified,
        verified.isLoading || pending.isLoading,
        isSelf
          ? "You haven't verified any claims yet."
          : 'No verified claims yet.',
      ),
    );
    return out;
  }, [
    requested.claims,
    requested.isLoading,
    verified.claims,
    verified.isLoading,
    pending.claims,
    pending.isLoading,
    expanded,
    isSelf,
    identityKey,
    username,
  ]);

  const refresh = () => {
    requested.refresh();
    verified.refresh();
    pending.refresh();
  };

  return (
    <>
      <List<Row>
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        renderItem={({ item }) => {
          switch (item.kind) {
            case 'section':
              return (
                <SectionHeader title={item.title} tooltip={item.tooltip} />
              );
            case 'claim':
              return <ClaimListItem claim={item.claim} showOwner={!isSelf} />;
            case 'empty':
              return <EmptyRow message={item.message} />;
            case 'show-more':
              return (
                <ShowMoreRow
                  onPress={() =>
                    setExpanded((prev) => ({ ...prev, [item.section]: true }))
                  }
                />
              );
            case 'request':
              return (
                <ClaimActionRow
                  title="Request a verification"
                  subtitle={`${username} can verify an existing claim of yours, or a new one.`}
                  onPress={() => setRequestOpen(true)}
                />
              );
          }
        }}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl
              refreshing={requested.isLoading || verified.isLoading}
              onRefresh={refresh}
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

function EmptyRow({ message }: { message: string }) {
  return (
    <View style={[Atoms.px_lg, Atoms.py_md]}>
      <Text variant="body" color="neutral_500">
        {message}
      </Text>
    </View>
  );
}

function ShowMoreRow({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ hovered, pressed }) => [
        (hovered || pressed) && {
          backgroundColor: theme.palette.neutral_25,
        },
      ]}
    >
      <View
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.gap_sm,
          Atoms.px_lg,
          Atoms.py_md,
        ]}
      >
        {/* <Icon name="chevronDown" size={18} color="primary_500" /> */}
        <Text
          variant="body"
          fontWeight="regular"
          color="primary_500"
          selectable={false}
        >
          Show more
        </Text>
      </View>
    </Pressable>
  );
}
