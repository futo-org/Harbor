import { Button, Text } from '@/src/common/components';
import { Sheet } from '@/src/common/components/sheet';
import { Routes } from '@/src/common/constants';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import useBlocks from '@/src/features/block/hooks/useBlocks';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { router } from 'expo-router';

export default function BlockedUsersSheet() {
  const { theme } = useTheme();
  const client = usePolycentric();
  const blocks = useBlocks((s) => s.blocks);
  const removeBlock = useBlocks((s) => s.removeBlock);

  const blocked = Array.from(blocks.keys());

  // The profile is outside this sheet's stack, so close the sheet first.
  const openProfile = (identity: string) => {
    if (router.canGoBack()) router.back();
    router.push(Routes.tabs.profile(identity));
  };

  return (
    <Sheet detents={[0.5, 1]} dismissible>
      <Sheet.Header
        title="Blocked Users"
        onClose={() => router.canGoBack() && router.back()}
      />
      <Sheet.Content style={[Atoms.p_0]}>
        {blocked.length === 0 ? (
          <Text variant="secondary" color="neutral_500" style={[Atoms.p_lg]}>
            {"You haven't blocked anyone"}
          </Text>
        ) : (
          blocked.map((identity, index) => (
            <ProfileRow
              key={identity}
              identity={identity}
              onPress={() => openProfile(identity)}
              style={{
                borderBottomWidth: index === blocked.length - 1 ? 0 : 1,
                borderColor: theme.palette.neutral_25,
              }}
              trailing={
                <Button
                  title="Unblock"
                  variant="secondary"
                  size="sm"
                  onPress={() => void removeBlock(client, identity)}
                />
              }
            />
          ))
        )}
      </Sheet.Content>
    </Sheet>
  );
}
