import HARBOR_LOGO from '@/src/common/assets/images/harbor-logo-256.png';
import SCENE_SPLASH from '@/src/common/assets/images/harbor-scene-splash.svg';
import { BackButton } from '@/src/common/components/composites/BackButton';
import { CloseButton } from '@/src/common/components/composites/CloseButton';
import { Routes } from '@/src/common/constants';
import { Atoms, Breakpoints, useTheme } from '@/src/common/theme';
import { isIOS } from '@/src/common/util/platform';
import { Image } from 'expo-image';
import { router, Slot, usePathname } from 'expo-router';
import { KeyboardAvoidingView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Content column width, matching the feed's. */
const CONTENT_WIDTH = 600;

/** Flow starts, so there is nothing to go back to. */
const FLOW_ENTRY_ROUTES = ['/signup', '/login'];

/** Signup and pairing run without app chrome and share this padding. */
export default function OnboardingLayout() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const pathname = usePathname();

  const close = () => {
    if (router.canGoBack()) router.dismissAll();
    else router.dismissTo(Routes.tabs.feed.index);
  };

  const showScene = width > Breakpoints.md;
  // A flow's end offers its own way onward, so it takes no controls.
  const isFlowEnd = pathname.endsWith('/success');
  const showBack = !isFlowEnd && !FLOW_ENTRY_ROUTES.includes(pathname);

  return (
    <View
      style={[
        Atoms.flex_1,
        Atoms.flex_row,
        { backgroundColor: theme.palette.neutral_0 },
      ]}
    >
      <KeyboardAvoidingView
        // Fixed beside the scene, otherwise fills and centres.
        style={[
          Atoms.items_center,
          showScene ? { width: CONTENT_WIDTH } : Atoms.flex_1,
        ]}
        behavior={isIOS ? 'padding' : 'height'}
        keyboardVerticalOffset={-insets.bottom}
      >
        <View
          style={[
            Atoms.flex_1,
            Atoms.w_full,
            Atoms.px_lg,
            {
              maxWidth: CONTENT_WIDTH,
              // Clears the status bar / notch the scene sits behind.
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View
            style={[
              Atoms.flex_row,
              Atoms.align_center,
              Atoms.gap_md,
              Atoms.mt_lg,
              Atoms.mb_lg,
            ]}
          >
            {showBack ? <BackButton onPress={() => router.back()} /> : null}
            <Image
              source={HARBOR_LOGO}
              contentFit="contain"
              style={{ width: 40, height: 40 }}
            />
            <View style={[Atoms.flex_1, Atoms.items_end]}>
              {isFlowEnd ? null : <CloseButton onPress={close} />}
            </View>
          </View>
          <Slot />
        </View>
      </KeyboardAvoidingView>

      {showScene ? (
        <View style={Atoms.flex_1}>
          <Image
            source={SCENE_SPLASH}
            contentFit="cover"
            contentPosition={{ top: 0, left: 'center' }}
            style={{ width: '100%', height: '100%' }}
          />
        </View>
      ) : null}
    </View>
  );
}
