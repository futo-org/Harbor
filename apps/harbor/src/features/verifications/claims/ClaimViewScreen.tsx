import { Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Atoms, useTheme } from '@/src/common/theme';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { type ClaimField, useClaimById } from '../hooks/useClaimById';
import { useClaimVerifiers } from '../hooks/useClaimVerifiers';
import { ClaimMenu } from './ClaimMenu';
import { ClaimVerifiersList } from './ClaimVerifiersList';
import { ClaimVerifyActions } from './ClaimVerifyActions';
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

  const { verifiers, verifiedCount, totalCount } = useClaimVerifiers(claim?.id);

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
                  {bodyFields.map((field) => {
                    const value = field.value.trim();
                    // URL values (e.g. a Platform claim's profile URL) open
                    // the linked account.
                    const isLink = /^https?:\/\//i.test(value);
                    return (
                      <View key={field.key} style={Atoms.gap_xs}>
                        <Text
                          variant="small"
                          style={theme.atoms.text_neutral_medium}
                          fontWeight="semibold"
                        >
                          {field.label}
                        </Text>
                        {isLink ? (
                          <Text
                            variant="body"
                            color="primary_500"
                            onPress={() =>
                              void Linking.openURL(value).catch(() => {})
                            }
                          >
                            {value}
                          </Text>
                        ) : (
                          <Text
                            variant="body"
                            style={
                              value
                                ? theme.atoms.text
                                : theme.atoms.text_neutral_medium
                            }
                          >
                            {value || 'N/A'}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>

                <ClaimVerifiersList verifiers={verifiers} />

                <View style={[Atoms.flex_1]} />
                <Toolbar
                  identity={claim.identity}
                  createdAt={claim.createdAt}
                  schemaName={claim.schemaName}
                  fields={claim.fields}
                />

                <ClaimVerifyActions
                  claim={claim}
                  verifiers={verifiers}
                  requestOnOpen={requestVerification === '1'}
                />
              </>
            )}
          </View>
        </ScrollView>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
