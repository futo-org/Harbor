import { Button, Text } from '@/src/common/components';
import { Sheet } from '@/src/common/components/sheet';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { ActivityIndicator, View } from 'react-native';
import useBanStatus from './hooks/useBanStatus';
import useModeratedServers from './hooks/useModeratedServers';

type BanSheetProps = {
  // Identity being moderated.
  identityKey: string;
  open: boolean;
  onClose: () => void;
};

/**
 * Lists every server the active identity is a moderator on, with a
 * ban/unban button per server for the viewed identity.
 */
export default function BanSheet({
  identityKey,
  open,
  onClose,
}: BanSheetProps) {
  const { theme } = useTheme();
  const { isLoading, servers } = useModeratedServers(open);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={[0.5, 1]}
      scrollable={true}
      header={<Sheet.Header title="Ban user" onClose={onClose} />}
    >
      <Sheet.Content style={[Atoms.gap_lg]}>
        {isLoading ? (
          <ActivityIndicator
            size="small"
            color={theme.palette.primary_500}
            accessibilityLabel="Checking moderator status"
          />
        ) : servers.length === 0 ? (
          <Text variant="secondary" color="neutral_500">
            You are not a moderator on any servers
          </Text>
        ) : (
          <View style={Atoms.gap_sm}>
            {servers.map((server) => (
              <ServerBanRow
                key={server}
                server={server}
                identityKey={identityKey}
              />
            ))}
          </View>
        )}
      </Sheet.Content>
    </Sheet>
  );
}

function ServerBanRow({
  server,
  identityKey,
}: {
  server: string;
  identityKey: string;
}) {
  const { theme } = useTheme();
  const { isLoading, isUpdating, banned, setBanned } = useBanStatus(
    server,
    identityKey,
  );

  const onPress = async () => {
    try {
      await setBanned(!banned);
    } catch (err) {
      console.error('Failed to update ban status:', err);
    }
  };

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.justify_between,
        Atoms.items_center,
        Atoms.gap_md,
        Atoms.p_md,
        Atoms.rounded_md,
        {
          backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
        },
      ]}
    >
      <Text
        variant="secondary"
        style={{ fontFamily: 'monospace', flex: 1 }}
        numberOfLines={1}
      >
        {server}
      </Text>
      {isLoading || isUpdating ? (
        <ActivityIndicator
          size="small"
          color={theme.palette.primary_500}
          accessibilityLabel="Updating ban status"
        />
      ) : (
        <Button
          size="sm"
          variant={banned ? 'tertiary' : 'destructive'}
          title={banned ? 'Unban' : 'Ban'}
          onPress={onPress}
        />
      )}
    </View>
  );
}
