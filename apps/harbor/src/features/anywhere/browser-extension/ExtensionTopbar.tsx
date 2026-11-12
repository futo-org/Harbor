import HARBOR_LOGO from '@/src/common/assets/images/harbor-logo-256.png';
import { Text } from '@/src/common/components';
import { TOPBAR_HEIGHT } from '@/src/common/components/metrics';
import { ProfileAvatar } from '@/src/common/components/primitives';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Image } from 'expo-image';
import { View } from 'react-native';

/** The extension's top bar: its name, and who it is signed in as. */
export function ExtensionTopbar() {
  const { theme } = useTheme();
  const { identity } = useCurrentIdentity();

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_sm,
        Atoms.px_md,
        {
          // As the app's Topbar.
          height: TOPBAR_HEIGHT,
          borderBottomWidth: 1,
          borderBottomColor: withHexOpacity(theme.palette.neutral_500, '10'),
        },
      ]}
    >
      <Image
        source={HARBOR_LOGO}
        contentFit="contain"
        style={{ width: 36, height: 36 }}
      />
      <Text
        variant="title"
        fontWeight="bold"
        numberOfLines={1}
        style={Atoms.flex_1}
      >
        Harbor{' '}
        <Text variant="title" fontWeight="regular">
          Anywhere
        </Text>
      </Text>
      {identity?.identityKey ? (
        <ProfileAvatar identityKey={identity.identityKey} size="sm" />
      ) : null}
    </View>
  );
}
