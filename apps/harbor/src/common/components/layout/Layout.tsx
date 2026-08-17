import {
  Atoms,
  Breakpoints,
  Spacing,
  typography,
  useTheme,
  withHexOpacity,
  ZIndex,
} from '@/src/common/theme';
import { isIOS, isWeb } from '@/src/common/util/platform';
import { Image } from 'expo-image';
import { type ExternalPathString, Link, usePathname } from 'expo-router';
import {
  type ComponentProps,
  memo,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '@/src/common/components/Icon';
import { IdentityFooter } from '@/src/features/core/identity/IdentityFooter';
import {
  SignupBar,
  SignupWidget,
} from '@/src/features/core/identity/SignupWidget';
import { SidebarSearch } from '@/src/features/search/SidebarSearch';
import HARBOR_LOGO from '../../assets/images/harbor-logo-256.png';
import { openCompose } from '../../constants';
import { useCurrentIdentity } from '../../lib/polycentric-hooks';
import { Button } from '../primitives';
import { AppFooter } from './AppFooter';
import { VerticalNav } from './nav/VerticalNav';
import Topbar from './Topbar';

type MainProps = {
  children: ReactElement | ReactElement[];
  style?: ComponentProps<typeof View>['style'];
};
function Main({ children, style }: MainProps) {
  const { width: deviceWidth } = useWindowDimensions();
  const containerWidth = deviceWidth <= Breakpoints.sm ? '100%' : undefined;
  const innerWidth =
    deviceWidth <= Breakpoints.sm
      ? '100%'
      : deviceWidth <= Breakpoints.md
        ? 600
        : deviceWidth <= Breakpoints.lg
          ? 920
          : deviceWidth <= Breakpoints['2xl']
            ? 990
            : 1050;

  const showRightSidebar = deviceWidth > Breakpoints.md;

  return (
    <View
      style={[
        Atoms.flex_shrink_1,
        Atoms.flex_grow_1,
        { width: containerWidth },
      ]}
      role="main"
    >
      <View
        style={[
          Atoms.flex_1,
          Atoms.flex_row,
          Atoms.justify_between,
          { width: innerWidth },
        ]}
      >
        {children}

        {showRightSidebar && <RightSidebar />}
      </View>
    </View>
  );
}

type PrimaryColumnProps = {
  children: ReactNode;
};
function PrimaryColumn({ children }: PrimaryColumnProps) {
  const { theme } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <View
      testID="primaryColumn"
      style={[
        Atoms.flex_1,
        isWeb && Atoms.pb_lg,
        isWeb && {
          maxWidth: 600,
          borderLeftColor: theme.palette.neutral_25,
          borderLeftWidth: 1,
          borderRightColor: theme.palette.neutral_25,
          borderRightWidth: 1,
        },
        // Web page-scroll: let the column grow with content so the
        // borders span the full scrollable height. `self_start` opts
        // out of the row's cross-axis stretch; `minHeight` keeps
        // borders painting to the viewport bottom on short-content
        // pages.
        isWeb && Atoms.self_start,
        isWeb && { minHeight: windowHeight },
      ]}
    >
      {children}
    </View>
  );
}

type ScreenProps = {
  children: ReactElement;
  showLeftSidebar?: boolean;
  keyboardAvoiding?: boolean;
};

function Screen({
  children,
  showLeftSidebar = true,
  keyboardAvoiding = false,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { width: deviceWidth } = useWindowDimensions();
  const { identity } = useCurrentIdentity();

  showLeftSidebar = showLeftSidebar && isWeb;

  // On the smallest web viewports the left sidebar is replaced by a
  // topbar whose menu button opens it as a drawer.
  const drawerMode = isWeb && deviceWidth <= Breakpoints.sm;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Narrow web viewports hide the right sidebar and its signup widget, so
  // signed-out visitors get a fixed bottom bar instead.
  const showSignupBar = isWeb && !identity && deviceWidth <= Breakpoints.md;
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes the drawer on every route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const body = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={[Atoms.flex_1, Atoms.flex_row, Atoms.w_full, Atoms.min_w_0]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
      {children}
    </KeyboardAvoidingView>
  ) : (
    children
  );

  return (
    <View
      testID="layout-screen"
      style={[
        drawerMode ? Atoms.flex_col : Atoms.flex_row,
        // Web: grow with content so the sidebars' containing block spans the
        // full scroll height, letting `position: sticky` pin them. Native
        // keeps a fixed viewport-height screen.
        isWeb ? { minHeight: '100%' } : Atoms.flex_1,
        { backgroundColor: theme.palette.neutral_0 },
        { paddingTop: insets.top },
        !isWeb && {
          borderBottomWidth: 1,
          borderBottomColor: theme.palette.neutral_25,
        },
      ]}
      dir="ltr"
    >
      {drawerMode && (
        <View style={{ position: 'sticky', top: 0, zIndex: ZIndex.raised }}>
          <Topbar
            left={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open menu"
                onPress={() => setDrawerOpen(true)}
                hitSlop={Spacing.lg}
              >
                <Icon name="menu" size={24} color="neutral_900" />
              </Pressable>
            }
          />
        </View>
      )}
      {showLeftSidebar && !drawerMode && <LeftSidebar />}
      <Main>{body}</Main>
      {showSignupBar && <SignupBar />}
      {drawerMode && drawerOpen && (
        <SidebarDrawer onClose={() => setDrawerOpen(false)} />
      )}
      {!isWeb && insets.top > 0 ? (
        // Opaque cap that sits on top of all descendants and visually
        // masks any content that overflows into the status-bar zone
        // (FlashList items scrolling past `paddingTop`, sliding sticky
        // headers, animation glitches, etc.). Avoids `overflow: hidden`
        // on Screen so shadows / scroll bounces aren't clipped.
        <View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: insets.top,
              backgroundColor: theme.palette.neutral_0,
              zIndex: ZIndex.raised,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

type SidebarContentProps = {
  narrow?: boolean;
  /** The mobile drawer also shows the app footer links. */
  showAppFooter?: boolean;
};

function SidebarContent({
  narrow = false,
  showAppFooter = false,
}: SidebarContentProps) {
  const { identity } = useCurrentIdentity();

  return (
    <>
      {/* 1st section (top) */}
      <View
        style={[Atoms.w_full, narrow && Atoms.align_center, Atoms.flex_col]}
      >
        <Link
          href="/"
          style={[
            Atoms.pt_sm,
            Atoms.pb_lg,
            Atoms.flex,
            Atoms.align_center,
            !narrow && Atoms.px_lg,
            narrow && Atoms.justify_center,
          ]}
        >
          <Image
            source={HARBOR_LOGO}
            contentFit="contain"
            style={{ width: 40, height: 40 }}
          />
        </Link>

        <VerticalNav showLabels={!narrow} />

        <View
          style={[
            Atoms.py_md,
            Atoms.self_stretch,
            narrow && Atoms.align_center,
          ]}
        >
          {identity && (
            <Button
              title={narrow ? '' : 'Post'}
              variant="primary"
              size="md"
              fullWidth={!narrow}
              icon={({ size, color }) => (
                <Icon name="add" size={size} color={color} />
              )}
              onPress={() => openCompose()}
            />
          )}
        </View>
      </View>
      {/* 2nd Section (bottom) */}
      <View
        style={[
          Atoms.py_md,
          Atoms.self_stretch,
          narrow && Atoms.align_center,
          showAppFooter && Atoms.gap_md,
        ]}
      >
        {identity && <IdentityFooter compact={narrow} />}
        {showAppFooter && <AppFooter />}
      </View>
    </>
  );
}

/** Drawer for the smallest web viewports: the sidebar content plus the
    app footer, over a dismissible backdrop. */
function SidebarDrawer({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.flex_row,
        {
          position: 'fixed' as 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: ZIndex.modal,
        },
      ]}
    >
      <View
        style={{
          width: 300,
          height: '100%',
          backgroundColor: theme.palette.neutral_0,
        }}
      >
        <RNScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            Atoms.justify_between,
            { minHeight: '100%', paddingHorizontal: 30 },
          ]}
        >
          <SidebarContent showAppFooter />
        </RNScrollView>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close menu"
        onPress={onClose}
        style={[
          Atoms.flex_1,
          { backgroundColor: withHexOpacity(theme.palette.black, '66') },
        ]}
      />
    </View>
  );
}

type LeftSidebarProps = {} & ComponentProps<typeof View>;

export const LeftSidebar = memo(function LeftSidebar({
  ...props
}: LeftSidebarProps) {
  const { width: deviceWidth } = useWindowDimensions();

  const narrowSidebar = deviceWidth <= Breakpoints.xl;

  return (
    <View
      role="navigation"
      style={[
        Atoms.flex_shrink_0,
        Atoms.flex_grow_1,
        { alignItems: 'flex-end' },
      ]}
    >
      <View style={{ width: narrowSidebar ? 88 : 275, height: '100%' }}>
        <View
          style={[
            {
              position: 'sticky',
              top: 0,
              height: '100vh',
            },
          ]}
        >
          <RNScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              Atoms.justify_between,
              Atoms.align_center,
              {
                minHeight: '100%',
                paddingHorizontal: narrowSidebar ? 0 : 30,
                width: narrowSidebar ? 88 : 275,
              },
            ]}
          >
            <SidebarContent narrow={narrowSidebar} />
          </RNScrollView>
        </View>
      </View>
    </View>
  );
});

export const RightSidebar = memo(function RightSidebar() {
  const { width: deviceWidth } = useWindowDimensions();
  const width = 350;
  const narrow = deviceWidth <= Breakpoints['2xl'];
  const marginRight = narrow ? 10 : 70;

  const { identity } = useCurrentIdentity();

  return (
    <View style={{ width, marginRight, height: '100%' }}>
      <View
        style={
          isWeb
            ? { position: 'sticky', top: 0, height: '100vh', width }
            : undefined
        }
      >
        <View
          style={[
            Atoms.justify_between,
            Atoms.align_center,
            Atoms.h_full,
            Atoms.pb_lg,
            narrow && Atoms.px_md,
          ]}
        >
          <View style={[Atoms.flex_1, Atoms.w_full, Atoms.pt_lg, Atoms.gap_md]}>
            <SidebarSearch />

            {!identity && <SignupWidget />}
          </View>
          <AppFooter />
        </View>
      </View>
    </View>
  );
});

Screen.LeftSidebar = LeftSidebar;
Screen.RightSidebar = RightSidebar;
Screen.Main = Main;
Screen.PrimaryColumn = PrimaryColumn;
Screen.Topbar = Topbar;

export { Screen };
