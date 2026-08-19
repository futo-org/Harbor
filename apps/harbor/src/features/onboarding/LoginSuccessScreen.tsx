import {
  Button,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { RETURN_TO_PARAM, Routes, safeReturnTo } from '@/src/common/constants';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

export default function LoginSuccessScreen({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const { theme } = useTheme();
  const { identityKey } = useCurrentIdentity();
  const profile = useProfile(identityKey);
  const returnTo = safeReturnTo(
    useLocalSearchParams()[RETURN_TO_PARAM] as string | undefined,
  );

  if (!identityKey) return null;
  const displayName = profile.name ?? 'Anon';

  return (
    <View
      style={[
        Atoms.flex_col,
        Atoms.flex_1,
        Atoms.items_center,
        Atoms.justify_center,
        Atoms.gap_2xl,
        { backgroundColor: theme.palette.neutral_0 },
      ]}
    >
      <View style={[Atoms.items_center, Atoms.gap_xs]}>
        <Text variant="title">{title}</Text>
        <Text variant="body" color="neutral_500" style={Atoms.text_center}>
          {subtitle}
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
          onPress={() =>
            router.dismissTo((returnTo ?? Routes.tabs.feed.index) as Href)
          }
        />
      </View>
    </View>
  );
}
