import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { ClaimCreateSheet } from './claims/create/ClaimCreateSheet';
import { ClaimList } from './claims/ClaimList';

export default function VerificationsScreen() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <ClaimList
          HeaderComponent={() => (
            <Topbar
              title="Verifications"
              left={isWeb ? <></> : undefined}
              right={<CreateClaimButton onPress={() => setCreateOpen(true)} />}
            />
          )}
          onCreateClaim={() => setCreateOpen(true)}
        />
        <ClaimCreateSheet
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      </Screen.PrimaryColumn>
    </Screen>
  );
}

function CreateClaimButton({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create a claim"
      onPress={onPress}
      hitSlop={Spacing['lg']}
      style={({ pressed }) => [
        Atoms.p_xs,
        Atoms.rounded_full,
        pressed && { backgroundColor: theme.palette.neutral_25 },
      ]}
    >
      <Icon name="add" size={24} color="neutral_800" />
    </Pressable>
  );
}
