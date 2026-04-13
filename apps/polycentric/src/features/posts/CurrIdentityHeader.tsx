import { IdentitySwitcherSheetInner } from '@/src/common/components/composites/IdentitySwitcherSheetInner';
import { Box } from '@/src/common/components/layouts';
import { Avatar, PubkeyTag, Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import {
  identiconUrl,
  publicKeyToStringURLSafe,
  useCurrentIdentity,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { useSheet } from '@/src/common/lib/sheet';
import { Atoms, useTheme } from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

export function CurrIdentityHeader() {
  const { identity: currentIdentity, publicKey: pubkey } = useCurrentIdentity();
  const { theme } = useTheme();
  const { Sheet, present } = useSheet();

  const username = useUsername(
    pubkey ?? { keyType: 0n, key: new Uint8Array() },
  );

  // this should never happen, root layout handles auth state
  if (!currentIdentity || !pubkey) {
    return null;
  }

  const avatarUrl = identiconUrl(pubkey);

  return (
    <>
      <Box
        style={[
          Atoms.flex_row,
          Atoms.justify_between,
          Atoms.items_center,
          Atoms.gap_md,
        ]}
      >
        <Pressable
          onPress={() => {
            present();
          }}
          hitSlop={10}
          style={{ flexShrink: 1 }}
        >
          <Box
            style={[
              Atoms.flex_row,
              Atoms.gap_sm,
              { flex: 1, alignItems: 'baseline' },
            ]}
          >
            <Text
              variant="title"
              fontWeight="bold"
              color="neutral_1000"
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {username}
            </Text>
            <PubkeyTag
              publicKey={pubkey}
              identity={currentIdentity.identityKey ?? undefined}
            />
            <Ionicons
              name="chevron-down"
              size={22}
              color={theme.palette.neutral_1000}
            />
          </Box>
        </Pressable>
        <Pressable
          onPress={() => {
            router.push(Routes.profile(publicKeyToStringURLSafe(pubkey)));
          }}
        >
          <Avatar source={avatarUrl ? { uri: avatarUrl } : undefined} />
        </Pressable>
      </Box>
      {/* Sheet must always be mounted to preserve state while open */}
      <Sheet detents={[0.5, 1]} scrollable>
        <IdentitySwitcherSheetInner />
      </Sheet>
    </>
  );
}
