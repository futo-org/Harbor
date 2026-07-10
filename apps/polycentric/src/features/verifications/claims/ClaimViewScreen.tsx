import { Button, Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ClaimField, useClaimById } from '../hooks/useClaimById';
import { useClaimVerifiers } from '../hooks/useClaimVerifiers';
import useVerifyClaim from '../hooks/useVerifyClaim';
import { ClaimMenu } from './ClaimMenu';
import { ClaimVerifiersList } from './ClaimVerifiersList';
import { RequestVerificationSheet } from '../RequestVerificationSheet';
import { resolveClaimTitle } from '../utils/render';
import { Toolbar } from './toolbar';
import { StatusChip } from './toolbar/StatusChip';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ViewClaimScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    identityId,
    keyFingerprint,
    sequence = '',
    requestVerification,
  } = useLocalSearchParams<{
    identityId: string;
    keyFingerprint: string;
    sequence: string;
    // Set when arriving from the create flow to open the sheet immediately.
    requestVerification?: string;
  }>();

  const { claim, isLoading } = useClaimById(
    identityId,
    keyFingerprint,
    sequence ? BigInt(sequence) : undefined,
  );

  const [sheetOpen, setSheetOpen] = useState(requestVerification === '1');

  const { verifiers, verifiedCount, totalCount } = useClaimVerifiers(claim?.id);

  const { identityKey } = useCurrentIdentity();
  const { verify, isPending: isVerifyPending } = useVerifyClaim();

  // Only the claim author can request verifications; a viewer asked to
  // verify gets a verify button instead, disabled once they have verified.
  const isAuthor = !!claim && claim.identity === identityKey;
  const isVerifyRequested = isAuthor
    ? undefined
    : verifiers.find((v) => v.identity === identityKey);

  const { title, bodyFields } = useMemo<{
    title: string;
    bodyFields: ClaimField[];
  }>(
    () =>
      claim
        ? resolveClaimTitle(claim.schemaName, claim.fields)
        : { title: '', bodyFields: [] },
    [claim],
  );

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <ScrollView
          HeaderComponent={
            <Topbar
              title="Claim"
              right={claim ? <ClaimMenu claim={claim} /> : undefined}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            Atoms.flex_1,
            { paddingBottom: insets.bottom },
          ]}
        >
          <View style={[Atoms.p_lg, Atoms.gap_lg, Atoms.flex_1]}>
            {isLoading && !claim && (
              <View style={[Atoms.items_center, Atoms.mt_lg]}>
                <ActivityIndicator />
              </View>
            )}

            {!isLoading && !claim && (
              <Text variant="body" style={theme.atoms.text}>
                Invalid claim reference
              </Text>
            )}

            {claim && (
              <>
                <View
                  style={[
                    Atoms.flex_row,
                    Atoms.align_center,
                    Atoms.gap_md,
                    Atoms.justify_between,
                    Atoms.flex_wrap,
                  ]}
                >
                  <Text variant="title" style={theme.atoms.text}>
                    {title}
                  </Text>

                  {/* Verified status */}
                  <StatusChip
                    verifiedCount={verifiedCount}
                    totalCount={totalCount}
                  />
                </View>

                <View style={Atoms.gap_md}>
                  {bodyFields.map((field) => (
                    <View key={field.key} style={Atoms.gap_xs}>
                      <Text
                        variant="small"
                        style={theme.atoms.text_neutral_medium}
                        fontWeight="semibold"
                      >
                        {field.label}
                      </Text>
                      <Text
                        variant="body"
                        style={
                          field.value.trim()
                            ? theme.atoms.text
                            : theme.atoms.text_neutral_medium
                        }
                      >
                        {field.value.trim() ? field.value : 'N/A'}
                      </Text>
                    </View>
                  ))}
                </View>

                <ClaimVerifiersList verifiers={verifiers} />

                <View style={[Atoms.flex_1]} />
                <Toolbar
                  identity={claim.identity}
                  createdAt={claim.createdAt}
                  schemaName={claim.schemaName}
                />

                {isAuthor && (
                  <>
                    <Button
                      title="Request verification"
                      variant="primary"
                      onPress={() => setSheetOpen(true)}
                      style={[Atoms.w_full]}
                    />

                    <RequestVerificationSheet
                      open={sheetOpen}
                      onClose={() => setSheetOpen(false)}
                      claimId={claim.id}
                    />
                  </>
                )}

                {isVerifyRequested && (
                  <Button
                    title={
                      isVerifyRequested.verified
                        ? 'Verified'
                        : 'Verify this claim'
                    }
                    variant="primary"
                    disabled={isVerifyRequested.verified || isVerifyPending}
                    onPress={() => verify({ claimId: claim.id })}
                    style={[Atoms.w_full]}
                  />
                )}
              </>
            )}
          </View>
        </ScrollView>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
