import { Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { Atoms, useTheme } from '@/src/common/theme';
import type { ClaimWithStatus } from '@/src/features/verifications/utils/claim-status';
import {
  getPlatformFromClaim,
  type Platform,
} from '@/src/features/verifications/utils/platforms';
import { useClaimsList } from '@/src/features/verifications/hooks/useClaimsList';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

// The identity's verified platform accounts as a comma-separated, wrapping list of "<logo> <account> on <platform>".
export function ProfileVerifiedPlatforms({
  identityKey,
  logoSize,
}: {
  identityKey: string;
  logoSize: number;
}) {
  const { claims } = useClaimsList(identityKey);

  const verifiedPlatformClaims = claims.flatMap((claim) => {
    const platform = getPlatformFromClaim(claim.schemaName, claim.fields);
    const account = claim.fields.find((f) => f.key === 'account')?.value;
    return platform && account && claim.status.verifiedCount > 0
      ? [{ claim, platform, account }]
      : [];
  });

  if (verifiedPlatformClaims.length === 0) return null;

  return (
    <View style={[Atoms.flex_row, Atoms.flex_wrap, Atoms.gap_xs]}>
      {verifiedPlatformClaims.map(({ claim, platform, account }, index) => (
        <VerifiedPlatformRow
          key={`${claim.keyFingerprint}-${claim.sequence}`}
          claim={claim}
          platform={platform}
          account={account}
          logoSize={logoSize}
          hasTrailingComma={index < verifiedPlatformClaims.length - 1}
        />
      ))}
    </View>
  );
}

function VerifiedPlatformRow({
  claim,
  platform,
  account,
  logoSize,
  hasTrailingComma,
}: {
  claim: ClaimWithStatus;
  platform: Platform;
  account: string;
  logoSize: number;
  hasTrailingComma: boolean;
}) {
  const { theme } = useTheme();
  // Attached to the row's last word so it never wraps onto next line on its own
  const comma = hasTrailingComma ? ',' : '';

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={
        platform.generic ? account : `${account} on ${platform.name}`
      }
      onPress={() =>
        router.navigate(
          Routes.tabs.verification(
            claim.identity,
            claim.keyFingerprint,
            claim.sequence.toString(),
          ),
        )
      }
      style={({ pressed }) => [
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.gap_xs,
        pressed && { opacity: 0.5 },
      ]}
    >
      {platform.logo({
        size: logoSize,
        color: theme.palette[platform.color],
      })}
      <Text
        variant="secondary"
        color="neutral_500"
        numberOfLines={1}
        style={{ flexShrink: 1 }}
      >
        {account}
        {platform.generic ? comma : null}
      </Text>
      {/* A generic platform's account is the website itself. */}
      {platform.generic ? null : (
        <Text variant="secondary" color="neutral_300" numberOfLines={1}>
          on {platform.name}
          {comma}
        </Text>
      )}
    </Pressable>
  );
}
