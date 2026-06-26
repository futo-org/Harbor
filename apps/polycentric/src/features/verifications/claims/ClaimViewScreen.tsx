import { Button, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Atoms, useTheme } from '@/src/common/theme';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ClaimField, useClaimById } from '../hooks/useClaimById';
import { RequestVerificationSheet } from '../RequestVerificationSheet';
import { resolveClaimTitle } from '../utils/render';
import { Toolbar } from './toolbar';

export default function ViewClaimScreen() {
  const { theme } = useTheme();
  const {
    identityId,
    keyFingerprint,
    sequence = '',
  } = useLocalSearchParams<{
    identityId: string;
    keyFingerprint: string;
    sequence: string;
  }>();

  const { claim, isLoading } = useClaimById(
    identityId,
    keyFingerprint,
    sequence ? BigInt(sequence) : undefined,
  );

  const [sheetOpen, setSheetOpen] = useState(false);

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
          HeaderComponent={<Topbar title="Claim" />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[Atoms.flex_1]}
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
                  <View
                    style={[
                      Atoms.flex_row,
                      Atoms.align_center,
                      Atoms.gap_xs,
                      Atoms.rounded_full,
                      Atoms.pt_sm,
                      Atoms.pb_sm,
                      Atoms.pl_md,
                      Atoms.pr_md,
                      Atoms.self_start,
                      Atoms.cursor_default,
                      {
                        borderWidth: 1,
                        borderColor: theme.palette.neutral_25,
                      },
                    ]}
                  >
                    <Icon name="close" color="neutral_600" />
                    <Text
                      selectable={false}
                      fontSize={'sm'}
                      color="neutral_600"
                      fontWeight="semibold"
                    >
                      Not verified
                    </Text>
                  </View>
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

                <View style={[Atoms.flex_1]} />
                <Toolbar
                  identity={claim.identity}
                  createdAt={claim.createdAt}
                  schemaName={claim.schemaName}
                />

                <Button
                  title="Request verification"
                  variant="primary"
                  onPress={() => setSheetOpen(true)}
                  style={[Atoms.w_full]}
                />

                <RequestVerificationSheet
                  open={sheetOpen}
                  onClose={() => setSheetOpen(false)}
                  identityId={claim.identity}
                  keyFingerprint={claim.keyFingerprint}
                  sequence={claim.sequence.toString()}
                />
              </>
            )}
          </View>
        </ScrollView>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
