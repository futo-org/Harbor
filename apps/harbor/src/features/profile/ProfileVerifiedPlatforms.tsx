import { Routes } from '@/src/common/constants';
import { Atoms, createThemedStyles } from '@/src/common/theme';
import { ClaimTypeChip } from '@/src/features/verifications/claims/toolbar/ClaimTypeChip';
import type { ClaimWithStatus } from '@/src/features/verifications/utils/claim-status';
import {
  getPlatformFromClaim,
  type Platform,
} from '@/src/features/verifications/utils/platforms';
import { useClaimsList } from '@/src/features/verifications/hooks/useClaimsList';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

// The identity's verified platform accounts as a wrapping list of "<logo> <platform>: <account>" pills.
export function ProfileVerifiedPlatforms({
  identityKey,
}: {
  identityKey: string;
}) {
  const styles = useStyles();
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
    <View style={styles.list}>
      {verifiedPlatformClaims.map(({ claim, platform, account }) => (
        <VerifiedPlatformPill
          key={`${claim.keyFingerprint}-${claim.sequence}`}
          claim={claim}
          platform={platform}
          account={account}
        />
      ))}
    </View>
  );
}

function VerifiedPlatformPill({
  claim,
  platform,
  account,
}: {
  claim: ClaimWithStatus;
  platform: Platform;
  account: string;
}) {
  const styles = useStyles();

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={
        platform.generic ? account : `${platform.name}: ${account}`
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
      style={({ pressed }) => pressed && styles.pillPressed}
    >
      <ClaimTypeChip
        // A generic platform's account is the website itself.
        name={platform.generic ? undefined : platform.name}
        value={account}
        icon="verify"
        logo={platform.logo}
        color={platform.color}
      />
    </Pressable>
  );
}

const useStyles = createThemedStyles((_theme, define) =>
  define({
    list: [Atoms.flex_row, Atoms.flex_wrap, Atoms.gap_xs],
    pillPressed: { opacity: 0.5 },
  }),
);
