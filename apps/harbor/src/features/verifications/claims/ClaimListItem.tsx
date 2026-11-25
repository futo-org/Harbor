import { Text } from '@/src/common/components';
import { Routes } from '@/src/common/constants';
import { useCardLinkPress } from '@/src/common/lib/navigation/useCardLinkPress';
import { Atoms, useTheme } from '@/src/common/theme';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { DecodedClaim } from '../hooks/useClaimById';
import type { ClaimVerificationStatus } from '../utils/claim-status';
import { CLAIM_TYPES } from '../utils/forms';
import { getPlatformFromClaim } from '../utils/platforms';
import { resolveClaimTitle } from '../utils/render';
import { ClaimAuthorLine } from './ClaimAuthorLine';
import { ClaimMenu } from './ClaimMenu';
import { ClaimTypeChip } from './toolbar/ClaimTypeChip';
import { LabelPill } from '@/src/features/moderation/LabelPill';
import { useLabelModeration } from '@/src/features/moderation/hooks/useLabelModeration';
import { LabelWarnOverlay } from '@/src/features/moderation/LabelWarnOverlay';
import { StatusChip } from './toolbar/StatusChip';
import Icon from '@/src/common/components/Icon';

export function ClaimListItem({
  claim,
  linkToClaim = false,
  onPress,
}: {
  claim: DecodedClaim & { status?: ClaimVerificationStatus };
  /**
   * A plain click navigates to the claim, after `onPress`. On web,
   * Cmd/Ctrl-click and middle-click open it in a new tab instead.
   */
  linkToClaim?: boolean;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const { title } = resolveClaimTitle(claim.schemaName, claim.fields);
  const claimType = CLAIM_TYPES.find((t) => t.name === claim.schemaName);
  // Platform claims chip as their platform (brand logo + name).
  const platform = getPlatformFromClaim(claim.schemaName, claim.fields);
  const { hasWarnContent, warnLabels } = useLabelModeration(claim.labels);
  const [warnDismissed, setWarnDismissed] = useState(false);
  const handleWarnDismiss = useCallback(() => setWarnDismissed(true), []);
  const handleWarnRestore = useCallback(() => setWarnDismissed(false), []);
  const isHidden = hasWarnContent && !warnDismissed;

  // TODO: Make this more sophisticated
  const isVerified = (claim.status?.verifiedCount || 0) > 0;

  const cardLinkProps = useCardLinkPress(
    linkToClaim
      ? Routes.tabs.verification(
          claim.identity,
          claim.keyFingerprint,
          claim.sequence.toString(),
        )
      : null,
    onPress,
  );

  return (
    <Pressable
      {...cardLinkProps}
      style={({ hovered, pressed }) => [
        Atoms.flex_1,
        Atoms.flex_row,
        (hovered || pressed) && theme.atoms.box.primary.bg_hover,
      ]}
    >
      <View
        style={[
          Atoms.my_xs,
          Atoms.ml_xs,
          Atoms.p_sm,
          isVerified ? theme.atoms.box.success.bg : theme.atoms.box.raised.bg,
        ]}
      >
        <Icon
          name="verify"
          color={isVerified ? 'light' : 'secondary'}
          size={24}
        />
      </View>
      <View
        style={[
          Atoms.flex_1,
          Atoms.gap_sm,
          Atoms.px_lg,
          Atoms.py_md,
          theme.atoms.box.primary.border,
          Atoms.border_b,
        ]}
      >
        <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_sm]}>
          <View style={Atoms.flex_1}>
            <ClaimAuthorLine
              identity={claim.identity}
              createdAt={claim.createdAt}
            />
          </View>
          <ClaimMenu claim={claim} icon="more" iconSize={16} />
        </View>
        {isHidden ? (
          <LabelWarnOverlay
            labels={warnLabels}
            authorIdentity={claim.identity}
            onDismiss={handleWarnDismiss}
          />
        ) : (
          <>
            <Text variant="body" selectable={false}>
              {title}
            </Text>
            {claim.labels && claim.labels.length > 0 ? (
              <LabelPill
                labels={claim.labels}
                action={hasWarnContent ? 'Hide' : undefined}
                onPress={handleWarnRestore}
              />
            ) : null}
          </>
        )}
        <View
          style={[
            Atoms.flex_row,
            Atoms.align_center,
            Atoms.gap_sm,
            Atoms.flex_wrap,
          ]}
        >
          {/* A custom schema's name is claim text, hidden with the rest. */}
          {isHidden ? null : (
            <ClaimTypeChip
              name={platform?.name ?? claim.schemaName}
              icon={claimType?.icon ?? 'verify'}
              logo={platform?.logo}
              tint={platform?.tint ?? claimType?.tint}
            />
          )}
          <StatusChip
            verifiedCount={claim.status?.verifiedCount}
            totalCount={claim.status?.totalCount}
          />
        </View>
      </View>
    </Pressable>
  );
}
