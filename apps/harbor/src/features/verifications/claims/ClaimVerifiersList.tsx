import { Text } from '@/src/common/components';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { Routes } from '@/src/common/constants/routes';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { router } from 'expo-router';
import { View } from 'react-native';
import type { ClaimVerifier } from '../utils/claim-status';

/** Who has been asked to verify the claim, and where each of them stands. */
export function ClaimVerifiersList({
  verifiers,
}: {
  verifiers: ClaimVerifier[];
}) {
  const { theme } = useTheme();

  if (verifiers.length === 0) return null;

  return (
    // Break out of the claim screen's horizontal padding so the rows run
    // edge to edge; the label and row contents keep the usual inset.
    <View style={[Atoms.gap_xs, { marginHorizontal: -Spacing.lg }]}>
      <Text
        variant="small"
        fontWeight="semibold"
        style={[theme.atoms.text_neutral_medium, Atoms.px_lg]}
      >
        Requested verifiers
      </Text>
      <View>
        {verifiers.map((verifier) => (
          <ProfileRow
            key={verifier.identity}
            identity={verifier.identity}
            size="sm"
            onPress={() => router.push(Routes.tabs.profile(verifier.identity))}
            trailing={
              <Text
                variant="small"
                fontWeight="semibold"
                color={verifier.verified ? 'positive_500' : 'neutral_500'}
                selectable={false}
              >
                {verifier.verified ? 'Verified' : 'Pending'}
              </Text>
            }
          />
        ))}
      </View>
    </View>
  );
}
