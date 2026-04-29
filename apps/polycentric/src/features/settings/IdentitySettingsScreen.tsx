import { DismissReason, SheetMenu } from '@/src/common/lib/sheet';
import { ProfileAvatar, Text } from '@/src/common/components';
import {
  publicKeyToString,
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { SheetHeaderBlock, type DismissSheet } from '@/src/common/lib/sheet';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

export function IdentitySettings({
  identityKey,
  dismissSheet,
}: {
  identityKey: string;
  dismissSheet: DismissSheet;
}) {
  const { theme } = useTheme();
  const client = usePolycentric();
  const profile = useProfile(identityKey);

  const [nameExpanded, setNameExpanded] = useState(false);

  const signingKey = client.currentKeyPair?.publicKey
    ? publicKeyToString(client.currentKeyPair.publicKey)
    : '';
  const displayName = profile.name;

  return (
    <View style={Atoms.flex_1}>
      <SheetHeaderBlock title="Identity" onClose={() => void dismissSheet()} />
      <View style={[Atoms.p_lg, Atoms.gap_xl]}>
        {/* Hero: avatar + name */}
        <View style={[Atoms.items_center, Atoms.gap_md, { paddingTop: 8 }]}>
          <Link href={'/feed/compose'}>
            <ProfileAvatar identityKey={identityKey} size="massive" />
          </Link>

          <View style={[Atoms.items_center, Atoms.gap_xs]}>
            <Text
              variant="title"
              fontWeight="bold"
              numberOfLines={nameExpanded ? undefined : 2}
              ellipsizeMode="tail"
              style={{ textAlign: 'center' }}
              onPress={() => setNameExpanded((v) => !v)}
            >
              {displayName || 'Anonymous'}
            </Text>
          </View>
        </View>

        {/* Details */}
        <View
          style={[
            Atoms.gap_md,
            Atoms.p_md,
            Atoms.rounded_md,
            {
              backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
            },
          ]}
        >
          <View style={Atoms.gap_xs}>
            <Text variant="small" color="neutral_500">
              IDENTITY
            </Text>
            <Text
              variant="secondary"
              style={{ fontFamily: 'monospace' }}
              selectable
            >
              {identityKey}
            </Text>
          </View>

          <View
            style={{
              height: 1,
              backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
            }}
          />

          <View style={Atoms.gap_xs}>
            <Text variant="small" color="neutral_500">
              SIGNING KEY
            </Text>
            <Text
              variant="secondary"
              style={{ fontFamily: 'monospace' }}
              selectable
            >
              {signingKey}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function IdentitySettingsScreen() {
  const { identityKey } = useCurrentIdentity();

  if (!identityKey) return null;

  return (
    <SheetMenu
      onClose={(reason) => {
        if (reason === DismissReason.UserDismissed) router.back();
      }}
      detents={[1]}
      dismissible
      scrollable
    >
      {(dismissSheet) => (
        <IdentitySettings
          identityKey={identityKey}
          dismissSheet={dismissSheet}
        />
      )}
    </SheetMenu>
  );
}
