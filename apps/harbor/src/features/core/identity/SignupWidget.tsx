import { Button, Text } from '@/src/common/components/primitives';
import { useIsStoragePersistent } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, ZIndex } from '@/src/common/theme';
import { useOnboardingLinks } from '@/src/features/onboarding/hooks/useOnboardingLinks';
import { Image } from 'expo-image';
import { usePathname } from 'expo-router';
import { View } from 'react-native';
import SCENE_SPLASH from '../../../common/assets/images/harbor-scene-splash.svg';

export const PRIVATE_BROWSING_NOTICE =
  'Sign up is unavailable in private browsing: this browser cannot store identity keys.';

type SignupWidgetProps = {
  /** Fires before either button navigates, e.g. to close a host sheet. */
  onAction?: () => void;
};

/** Sidebar signup prompt shown to signed-out visitors on web. */
export function SignupWidget({ onAction }: SignupWidgetProps = {}) {
  const { theme } = useTheme();
  const isStoragePersistent = useIsStoragePersistent();
  const links = useOnboardingLinks(usePathname());

  return (
    <View
      style={[
        Atoms.rounded_xl,
        Atoms.overflow_hidden,
        { backgroundColor: theme.palette.neutral_25 },
      ]}
    >
      <Image
        source={SCENE_SPLASH}
        contentFit="cover"
        contentPosition={{ top: 0, left: 'center' }}
        style={{ width: '100%', height: 150 }}
      />
      <View style={[Atoms.p_md, Atoms.gap_md]}>
        <View>
          <Text fontWeight="bold">Join Harbor</Text>
          <Text variant="small" color="neutral_500">
            Share to the world, not platforms.
          </Text>
        </View>
        {isStoragePersistent ? (
          <View style={Atoms.gap_sm}>
            <Button
              title="Create new identity"
              variant="primary"
              fullWidth
              href={links.signup}
              onPress={onAction}
            />
            <Button
              title="I already have an identity"
              variant="tertiary"
              fullWidth
              href={links.login}
              onPress={onAction}
            />
          </View>
        ) : (
          <Text variant="small" color="neutral_500">
            {PRIVATE_BROWSING_NOTICE}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * Fixed bottom signup bar for signed-out visitors on narrow web
 * viewports, where the right sidebar (and its SignupWidget) is hidden.
 */
export function SignupBar() {
  const { theme } = useTheme();
  const isStoragePersistent = useIsStoragePersistent();
  const links = useOnboardingLinks(usePathname());

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.justify_between,
        Atoms.gap_md,
        Atoms.px_lg,
        Atoms.py_md,
        {
          position: 'fixed' as 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: theme.palette.neutral_0,
          borderTopWidth: 1,
          borderTopColor: theme.palette.neutral_25,
          zIndex: ZIndex.raised,
        },
      ]}
    >
      <View style={Atoms.flex_shrink_1}>
        <Text fontWeight="bold">Join Harbor</Text>
        <Text variant="small" color="neutral_500">
          Share to the world, not platforms.
        </Text>
      </View>
      {isStoragePersistent ? (
        <View style={[Atoms.flex_row, Atoms.gap_sm]}>
          <Button title="Sign up" variant="primary" href={links.signup} />
          <Button title="Log in" variant="tertiary" href={links.login} />
        </View>
      ) : null}
    </View>
  );
}
