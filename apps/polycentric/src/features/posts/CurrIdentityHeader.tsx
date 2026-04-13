import { Box } from '@/src/common/components/layouts';
import { Avatar, PubkeyTag, Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import {
  identiconUrl,
  publicKeyToStringURLSafe,
  useCurrentIdentity,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  BorderRadius,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

export function CurrIdentityHeader() {
  const { identity: currentIdentity } = useCurrentIdentity();
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const pubkey = currentIdentity?.keyPair.publicKey;
  const username = useUsername(
    pubkey ?? { keyType: 0n, key: new Uint8Array() },
  );

  if (!currentIdentity || !pubkey) {
    return null;
  }

  const avatarUrl = identiconUrl(pubkey);

  const identityRowHoverOverlay =
    theme.scheme === 'light'
      ? withHexOpacity(theme.palette.neutral_500, '14')
      : withHexOpacity(theme.palette.black, '28');

  return (
    <Box
      style={[
        Atoms.flex_row,
        Atoms.justify_between,
        Atoms.items_center,
        Atoms.gap_md,
      ]}
    >
      <Pressable
        onPress={() => router.push(Routes.tabs.feed.identity)}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        hitSlop={10}
        style={[
          Atoms.px_sm,
          Atoms.py_sm,
          {
            flexShrink: 1,
            borderRadius: BorderRadius.sm,
            overflow: 'hidden',
            position: 'relative',
          },
        ]}
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
          <PubkeyTag publicKey={pubkey} />
          <Ionicons
            name="chevron-down"
            size={22}
            color={theme.palette.neutral_1000}
          />
        </Box>
        {hovered ? (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: BorderRadius.sm,
                backgroundColor: identityRowHoverOverlay,
              },
            ]}
          />
        ) : null}
      </Pressable>
      <Pressable
        onPress={() => {
          router.push(Routes.tabs.profile(publicKeyToStringURLSafe(pubkey)));
        }}
      >
        <Avatar source={avatarUrl ? { uri: avatarUrl } : undefined} />
      </Pressable>
    </Box>
  );
}
