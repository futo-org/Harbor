import {
  Button,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { useOnboardingLinks } from '@/src/features/onboarding/hooks/useOnboardingLinks';
import { Username } from '@/src/features/profile/Username';
import { router } from 'expo-router';
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
  const links = useOnboardingLinks();

  if (!identityKey) return null;

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
          <Username
            identity={identityKey}
            variant="title"
            style={[Atoms.text_center, Atoms.max_w_full]}
          />
        </View>
      </View>

      <View style={{ width: '100%', maxWidth: 320 }}>
        <Button
          title="Continue"
          variant="primary"
          fullWidth
          onPress={() => router.dismissTo(links.landing)}
        />
      </View>
    </View>
  );
}
