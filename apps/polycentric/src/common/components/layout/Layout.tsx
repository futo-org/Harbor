import { Atoms, Breakpoints, typography, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { Image } from 'expo-image';
import { ExternalPathString, Link } from 'expo-router';
import {
  ComponentProps,
  memo,
  ReactElement,
  ReactNode,
  useCallback,
  useState,
} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IdentityFooter } from '@/src/features/core/identity/IdentityFooter';
import { Ionicons } from '@expo/vector-icons';
import WEB_LOGO from '../../assets/images/PolycentricLogoTransparent256.png';
import { FUTO_URL, openCompose } from '../../constants';
import { useCurrentIdentity } from '../../lib/polycentric-hooks';
import { Button } from '../primitives';
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

  showLeftSidebar = showLeftSidebar && isWeb;

  const body = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={[Atoms.flex_1, Atoms.flex_row, Atoms.w_full, Atoms.min_w_0]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.bottom}
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
        Atoms.flex_row,
        Atoms.flex_1,
        { backgroundColor: theme.palette.neutral_0 },
        { paddingTop: insets.top },
        !isWeb && {
          borderBottomWidth: 1,
          borderBottomColor: theme.palette.neutral_25,
        },
      ]}
      dir="ltr"
    >
      {showLeftSidebar && <LeftSidebar />}
      <Main>{body}</Main>
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
              zIndex: 1,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

type LeftSidebarProps = {} & ComponentProps<typeof View>;

export const LeftSidebar = memo(function LeftSidebar({
  ...props
}: LeftSidebarProps) {
  const { width: deviceWidth } = useWindowDimensions();

  const { identity } = useCurrentIdentity();

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
      <View style={{ width: narrowSidebar ? 88 : 275 }}>
        <View
          style={[
            {
              position: 'fixed',
              top: 0,
              height: '100%',
            },
          ]}
        >
          <View
            style={[
              Atoms.justify_between,
              Atoms.align_center,
              Atoms.h_full,
              {
                paddingHorizontal: narrowSidebar ? 0 : 30,
                width: narrowSidebar ? 88 : 275,
              },
            ]}
          >
            {/* 1st section (top) */}
            <View
              style={[
                Atoms.w_full,
                narrowSidebar && Atoms.align_center,
                Atoms.flex_col,
              ]}
            >
              <Link
                href="/"
                style={[
                  Atoms.py_lg,
                  Atoms.flex,
                  Atoms.align_center,
                  !narrowSidebar && Atoms.px_lg,
                  narrowSidebar && Atoms.justify_center,
                ]}
              >
                <Image
                  source={WEB_LOGO}
                  contentFit="contain"
                  style={{ width: 30, height: 30 }}
                />
              </Link>

              <VerticalNav />

              <View
                style={[
                  Atoms.py_md,
                  Atoms.self_stretch,
                  narrowSidebar && Atoms.align_center,
                ]}
              >
                {identity && (
                  <Button
                    title={narrowSidebar ? '' : 'Post'}
                    variant="primary"
                    size="md"
                    fullWidth={!narrowSidebar}
                    icon={({ size, color }) => (
                      <Ionicons name="add-circle" size={size} color={color} />
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
                narrowSidebar && Atoms.align_center,
              ]}
            >
              {identity && <IdentityFooter compact={narrowSidebar} />}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
});

type RightSidebarProps = {} & ComponentProps<typeof View>;
export const RightSidebar = memo(function RightSidebar({
  ...props
}: RightSidebarProps) {
  const { theme, setActiveThemeName } = useTheme();

  const { width: deviceWidth } = useWindowDimensions();
  const width = 350;
  const marginRight = deviceWidth <= Breakpoints['2xl'] ? 10 : 70;

  const toggleTheme = useCallback(() => {
    const next = theme.name === 'dark' ? 'light' : 'dark';
    setActiveThemeName(next);
  }, [setActiveThemeName, theme.name]);

  const LINKS: { text: string; href: ExternalPathString }[] = [
    {
      text: 'Privacy Policy',
      href: 'https://docs.polycentric.io/privacy-policy/',
    },
    {
      text: 'Source Code',
      href: 'https://gitlab.futo.org/polycentric/polycentric',
    },
    { text: 'FUTO © 2026.', href: FUTO_URL },
  ];

  return (
    <View style={{ width, marginRight }}>
      {/* Pin to viewport on web so it stays visible while the primary
          column scrolls; the outer View reserves the row space. */}
      <View
        style={
          isWeb
            ? { position: 'fixed', top: 0, height: '100%', width }
            : undefined
        }
      >
        <View
          style={[
            Atoms.justify_between,
            Atoms.align_center,
            Atoms.h_full,
            Atoms.pb_lg,
          ]}
        >
          <View style={[Atoms.flex_1]}></View>
          <View
            style={[
              Atoms.flex_row,
              Atoms.items_center,
              Atoms.w_full,
              Atoms.py_sm,
              Atoms.px_sm,
              Atoms.gap_sm,
              Atoms.flex_wrap,
            ]}
          >
            <Pressable
              accessibilityLabel="Toggle color theme"
              accessibilityRole="button"
              hitSlop={8}
              onPress={toggleTheme}
              style={({ pressed }) => [pressed && { opacity: 0.65 }]}
            >
              <Ionicons
                name={theme.name === 'dark' ? 'moon' : 'sunny'}
                size={typography.fontSize.sm}
                color={theme.palette.neutral_500}
              />
            </Pressable>
            {LINKS.map(({ text, href }) => (
              <RightSidebarLink key={href} href={href} text={text} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
});

type RightSidebarLinkProps = {
  href: ExternalPathString;
  text: string;
};
function RightSidebarLink({ href, text }: RightSidebarLinkProps) {
  const { theme } = useTheme();
  const [hovering, setHovering] = useState(false);
  return (
    <Link
      href={href}
      accessibilityRole="link"
      accessibilityLabel={text}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={[
        theme.atoms.text_neutral_low,
        hovering && { textDecorationLine: 'underline' },
      ]}
    >
      {text}
    </Link>
  );
}

Screen.LeftSidebar = LeftSidebar;
Screen.RightSidebar = RightSidebar;
Screen.Main = Main;
Screen.PrimaryColumn = PrimaryColumn;
Screen.Topbar = Topbar;

export { Screen };
