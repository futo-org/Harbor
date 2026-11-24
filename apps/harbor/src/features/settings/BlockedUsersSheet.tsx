import { Button, Text } from '@/src/common/components';
import { Sheet } from '@/src/common/components/sheet';
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

  const closeSheet = () => {
    if (router.canGoBack()) router.back();
  };

  return (
    <Sheet detents={[0.5, 1]} dismissible>
      <Sheet.Header title="Blocked Users" onClose={closeSheet} />
      <Sheet.Content style={[Atoms.p_0]}>
        {blocked.length === 0 ? (
          <Text variant="secondary" color="muted" style={[Atoms.p_lg]}>
            {"You haven't blocked anyone"}
          </Text>
        ) : (
          blocked.map((identity, index) => (
            <ProfileRow
              key={identity}
              identity={identity}
              linkToProfile
              // The profile is outside this sheet's stack, so close the sheet first.
              onPress={closeSheet}
              style={[
                theme.atoms.box.primary.border,
                index < blocked.length - 1 && Atoms.border_b,
              ]}
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
