import { Button, Text } from '@/src/common/components';
import { Sheet } from '@/src/common/components/sheet';
import { confirm } from '@/src/common/lib/dialogs/alert';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import useBanStatus from './hooks/useBanStatus';
import useModerationStatus from './hooks/useModerationStatus';

type BanSheetProps = {
  // Identity being moderated.
  identityKey: string;
  open: boolean;
  onClose: () => void;
};

/**
 * Lists every server the active identity is a moderator on, with a
 * ban/unban button per server for the viewed identity. The per-server
 * ban statuses come from a single fan-out query limited to the
 * moderated servers, fetched once per open.
 */
export default function BanSheet({
  identityKey,
  open,
  onClose,
}: BanSheetProps) {
  const { theme } = useTheme();
  const { isLoading: isModeratorLoading, moderatedServers: servers } =
    useModerationStatus();
  const { isLoading, bannedByServer, setBanned } = useBanStatus(
    identityKey,
    open,
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={[0.5, 1]}
      scrollable={true}
      header={<Sheet.Header title="Ban user" onClose={onClose} />}
    >
      <Sheet.Content style={[Atoms.gap_lg]}>
        {isModeratorLoading || isLoading ? (
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
                banned={bannedByServer.get(server) ?? false}
                setBanned={setBanned}
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
  banned,
  setBanned,
}: {
  server: string;
  banned: boolean;
  setBanned: (server: string, banned: boolean) => Promise<void>;
}) {
  const { theme } = useTheme();
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const onPress = async () => {
    const ok = await confirm({
      title: banned ? 'Unban User' : 'Ban User',
      message: banned ? 'Unban this user?' : 'Ban this user?',
      confirmText: banned ? 'Unban' : 'Ban',
    });
    if (!ok) return;
    setIsUpdating(true);
    try {
      await setBanned(server, !banned);
    } catch (err) {
      console.error('Failed to update ban status:', err);
    } finally {
      setIsUpdating(false);
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
      {isUpdating ? (
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
