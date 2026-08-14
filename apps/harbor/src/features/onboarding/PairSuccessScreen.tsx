import { Button, ProfileAvatar, Screen, Text } from '@/src/common/components';
import { Routes } from '@/src/common/constants';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { router } from 'expo-router';
import { View } from 'react-native';

export default function PairSuccessScreen() {
  const { theme } = useTheme();
  const { identityKey } = useCurrentIdentity();
  const profile = useProfile(identityKey);

  if (!identityKey) return null;
  const displayName = profile.name ?? 'Anon';

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View
          style={[
            Atoms.flex_col,
            Atoms.flex_1,
            Atoms.px_lg,
            Atoms.items_center,
            Atoms.justify_center,
            Atoms.gap_2xl,
            { backgroundColor: theme.palette.neutral_0 },
          ]}
        >
          <View style={[Atoms.items_center, Atoms.gap_xs]}>
            <Text variant="title">Pair Successful!</Text>
            <Text
              variant="body"
              color="neutral_500"
              style={{ textAlign: 'center' }}
            >
              Your device has been paired
            </Text>
          </View>

          <View style={[Atoms.items_center, Atoms.gap_md]}>
            <ProfileAvatar identityKey={identityKey} size="xl" />

            <View style={[Atoms.items_center, Atoms.gap_xs]}>
              <Text
                variant="title"
                numberOfLines={1}
                style={[Atoms.text_center, Atoms.max_w_full]}
              >
                {displayName}
              </Text>
            </View>
          </View>

          <View style={{ width: '100%', maxWidth: 320 }}>
            <Button
              title="Continue"
              variant="primary"
              fullWidth
              onPress={() => router.replace(Routes.tabs.feed.index)}
            />
          </View>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
