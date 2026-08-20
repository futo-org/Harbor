import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon, { type IconName } from '@/src/common/components/Icon';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Alert } from '@/src/common/util/Alert';
import { useState } from 'react';
import { View } from 'react-native';
import ReportSheet from '../../moderation/ReportSheet';
import type { DecodedClaim } from '../hooks/useClaimById';
import useClaimActions from '../hooks/useClaimActions';

// Overflow menu for a claim: the author can delete it, everyone else can
// report it.
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
                (hovered || pressed) && {
                  backgroundColor: withHexOpacity(
                    theme.palette.neutral_500,
                    '14',
                  ),
                },
              ]}
            >
              <Icon name={icon} color="neutral_500" size={iconSize} />
            </View>
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {isAuthor ? (
            <DropdownMenu.Item onPress={onDeletePress}>
              <Icon name="trashBin" color="negative_500" size={16} />
              <Text variant="secondary" fontWeight="bold" color="negative_500">
                Delete
              </Text>
            </DropdownMenu.Item>
          ) : (
            <DropdownMenu.Item onPress={() => setShowReportSheet(true)}>
              <Icon name="flag" color="neutral_500" size={16} />
              <Text variant="secondary" fontWeight="bold">
                Report
              </Text>
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu>

      <ReportSheet
        eventId={claim.id}
        open={showReportSheet}
        onClose={() => setShowReportSheet(false)}
      />
    </>
  );
}
