import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, Avatar, PubkeyTag } from '@/components/primitives';
import { Box } from '@/components/layouts';
import { IdentitySwitcherSheetInner } from '@/components/composites/IdentitySwitcherSheetInner';
import {
  useCurrentIdentity,
  useUsername,
  publicKeyToStringURLSafe,
  identiconUrl,
} from '@/lib/polycentric-hooks';
import { Routes } from '@/constants';
import { useSheet } from '@/lib/sheet';
import { useTheme } from '@/theme';

export function CurrIdentityHeader() {
  const { identity: currentIdentity } = useCurrentIdentity();
  const { theme } = useTheme();
  const router = useRouter();
  const { Sheet, present, dismiss } = useSheet();

  const pubkey = currentIdentity?.keyPair.publicKey;
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
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        gap="md"
      >
        <Pressable
          onPress={() => {
            present();
          }}
          hitSlop={10}
          style={{ flexShrink: 1 }}
        >
          <Box
            flexDirection="row"
            alignItems="baseline"
            gap="sm"
            style={{ flex: 1 }}
          >
            <Text
              variant="title"
              fontWeight="bold"
              color="text"
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {username}
            </Text>
            <PubkeyTag publicKey={pubkey} />
            <Ionicons name="chevron-down" size={22} color={theme.colors.text} />
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
      <Sheet detents={[0.5, 1]}>
        <IdentitySwitcherSheetInner dismiss={dismiss} />
      </Sheet>
    </>
  );
}
