import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon, { type IconName } from '@/src/common/components/Icon';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { Alert } from '@/src/common/util/Alert';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import ReportSheet from '../../moderation/ReportSheet';
import type { DecodedClaim } from '../hooks/useClaimById';
import useClaimActions from '../hooks/useClaimActions';
import { ClaimLinkShareSheet } from './link/ClaimLinkShareSheet';
import { claimCloneLink } from './link/lib/claim-clone-link';
import { claimLinkRoute } from './link/lib/claim-link';

// Overflow menu for a claim: anyone can clone it, the author can delete it,
// everyone else can report it.
export function ClaimMenu({
  claim,
  icon = 'dotsVertical',
  iconSize = 20,
}: {
  claim: DecodedClaim;
  icon?: IconName;
  iconSize?: number;
}) {
  const { theme } = useTheme();
  const { identityKey } = useCurrentIdentity();
  const isAuthor = identityKey === claim.identity;

  const { deleteAsync } = useClaimActions(claim);
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const cloneLink = useMemo(() => claimCloneLink(claim), [claim]);

  const onDeletePress = async () => {
    await new Promise((resolve, reject) => {
      Alert.alert('Are you sure?', 'Confirm you wish to delete this claim', [
        { text: 'Confirm', onPress: () => resolve(true), style: 'destructive' },
        { text: 'Cancel', onPress: () => reject(), style: 'cancel' },
      ]);
    });
    await deleteAsync();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger hitSlop={16} style={Atoms.outline_none}>
          {({ pressed, hovered }) => (
            <View
              style={[
                Atoms.p_xs,
                Atoms.rounded_full,
                Atoms.overflow_hidden,
                (hovered || pressed) && theme.atoms.box.raised.bg,
              ]}
            >
              <Icon name={icon} color="muted" size={iconSize} />
            </View>
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {cloneLink ? (
            <DropdownMenu.Item
              onPress={() => setShowClone(true)}
              testID="claim-clone"
            >
              <Icon name="copy" color="muted" size={16} />
              <Text variant="secondary" fontWeight="bold">
                Clone
              </Text>
            </DropdownMenu.Item>
          ) : null}
          {isAuthor ? (
            <DropdownMenu.Item onPress={onDeletePress}>
              <Icon name="trashBin" color="danger" size={16} />
              <Text variant="secondary" fontWeight="bold" color="danger">
                Delete
              </Text>
            </DropdownMenu.Item>
          ) : (
            <DropdownMenu.Item onPress={() => setShowReportSheet(true)}>
              <Icon name="flag" color="muted" size={16} />
              <Text variant="secondary" fontWeight="bold">
                Report
              </Text>
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu>

      {cloneLink ? (
        <ClaimLinkShareSheet
          open={showClone}
          onClose={() => setShowClone(false)}
          link={cloneLink}
          title="Clone claim"
          caption={claim.schemaName}
          hint="Scanning this opens the same claim for someone else to make."
          start={{
            title: 'Clone this claim',
            onPress: () => {
              setShowClone(false);
              router.navigate(claimLinkRoute(cloneLink));
            },
          }}
        />
      ) : null}

      <ReportSheet
        eventId={claim.id}
        open={showReportSheet}
        onClose={() => setShowReportSheet(false)}
      />
    </>
  );
}
