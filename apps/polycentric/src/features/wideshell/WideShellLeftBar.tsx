import { Button, Text } from '@/src/common/components';
import { openCompose, Routes } from '@/src/common/constants';
import {
  pubkeyStr,
  publicKeyToStringURLSafe,
  stringURLSafeToPublicKey,
  useCurrentIdentity,
} from '@/src/common/lib/polycentric-hooks';
import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { lightPalette } from '@/src/common/theme/palette';
import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { Link, usePathname } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { useMemo } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Image, Pressable, View } from 'react-native';

import { WideShellMode, useWideShellMode } from './useWideShellMode';

const WEB_LOGO = require('../../common/assets/images/WebLogo.png');

const WEB_RAIL_WIDTH_COLLAPSED = 54;

const RAIL = {
  iconSize: 22,
  maxWidthLabeled: 152,
} as const;

const WEB_RAIL_WIDTH_LABELED = RAIL.maxWidthLabeled;

type LeftNavRow = {
  key: string;
  label: string;
  href: Href;
  pathPrefix: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  iconActive: ComponentProps<typeof Ionicons>['name'];
};

function pathOnly(pathname: string): string {
  const noQuery = pathname.split('?')[0] ?? pathname;
  const n = noQuery.replace(/\/$/, '') || '/';
  return n;
}

function isLeftNavPathActive(pathname: string, pathPrefix: string) {
  const n = pathOnly(pathname);
  return n === pathPrefix || n.startsWith(`${pathPrefix}/`);
}

function isFeedHomeActive(pathname: string): boolean {
  const n = pathOnly(pathname);
  return n === '/feed' || n === '/feed/index';
}

function isOwnProfileNavActive(pathname: string, ownPubkeyUrlSafe: string) {
  const n = pathOnly(pathname);
  const prefix = '/profile/';
  if (!n.startsWith(prefix)) return false;
  const rest = n.slice(prefix.length);
  try {
    const fromPath = stringURLSafeToPublicKey(rest);
    const fromOwn = stringURLSafeToPublicKey(ownPubkeyUrlSafe);
    return pubkeyStr(fromPath) === pubkeyStr(fromOwn);
  } catch {
    return false;
  }
}

function isLeftNavRowActive(
  pathname: string,
  row: LeftNavRow,
  ownPubkeyUrlSafe: string | null,
): boolean {
  switch (row.key) {
    case 'home':
      return isFeedHomeActive(pathname);
    case 'profile':
      if (ownPubkeyUrlSafe) {
        return isOwnProfileNavActive(pathname, ownPubkeyUrlSafe);
      }
      return isLeftNavPathActive(pathname, row.pathPrefix);
    default:
      return isLeftNavPathActive(pathname, row.pathPrefix);
  }
}

const LEFT_NAV_HOME: LeftNavRow = {
  key: 'home',
  label: 'Home',
  href: Routes.tabs.feed.index as Href,
  pathPrefix: '/feed',
  icon: 'home-outline',
  iconActive: 'home',
};

const LEFT_NAV_PROFILE: Omit<LeftNavRow, 'href'> = {
  key: 'profile',
  label: 'Profile',
  pathPrefix: '/profile',
  icon: 'person-outline',
  iconActive: 'person',
};

const LEFT_NAV_SETTINGS: LeftNavRow = {
  key: 'settings',
  label: 'Settings',
  href: '/(tabs)/settings' as Href,
  pathPrefix: '/settings',
  icon: 'settings-outline',
  iconActive: 'settings',
};

const LEFT_NAV_ORDER = ['home', 'profile', 'settings'];

function NavIconSlot({ children }: { children: ReactNode }) {
  return (
    <View
      style={[
        { width: RAIL.iconSize, height: RAIL.iconSize },
        Atoms.items_center,
        Atoms.justify_center,
      ]}
    >
      {children}
    </View>
  );
}

type NavRailPressableProps = Omit<PressableProps, 'style'> & {
  children: ReactNode;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

function NavRailPressable({
  children,
  accessibilityLabel,
  style: styleProp,
  ...rest
}: NavRailPressableProps) {
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const hoverSurface = {
    cursor: 'pointer' as const,
    transition: 'none',
    backgroundColor: hovered
      ? theme.scheme === 'dark'
        ? withHexOpacity(theme.palette.white, '0C')
        : withHexOpacity(theme.palette.neutral_900, '12')
      : 'transparent',
  } as ViewStyle;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={[Atoms.rounded_md, hoverSurface, styleProp]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

function NavRowContent({
  showLabels,
  fillRow = true,
  icon,
  label,
}: {
  showLabels: boolean;
  /** Full-width row for icon+label links; `false` for logo (hit area = icon + padding only). */
  fillRow?: boolean;
  icon: ReactNode;
  label: ReactNode | null;
}) {
  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.p_lg,
        ...(showLabels
          ? fillRow
            ? [Atoms.w_full, Atoms.gap_md]
            : []
          : [Atoms.w_full, Atoms.justify_center]),
      ]}
    >
      <NavIconSlot>{icon}</NavIconSlot>
      {label}
    </View>
  );
}

export function WideShellLeftBar() {
  const { theme } = useTheme();
  const wideShellMode = useWideShellMode();
  const pathname = usePathname();
  const { publicKey } = useCurrentIdentity();
  const myProfilePubkeyUrlSafe = useMemo(
    () => (publicKey ? publicKeyToStringURLSafe(publicKey) : null),
    [publicKey],
  );
  const showLabels = wideShellMode === WideShellMode.Full;
  const inactiveRailTint =
    theme.scheme === 'dark'
      ? theme.palette.neutral_800
      : theme.palette.neutral_700;
  const activeRailPrimary =
    theme.scheme === 'dark'
      ? lightPalette.primary_400
      : theme.palette.primary_500;
  const composeActive = isLeftNavPathActive(pathname, Routes.tabs.feed.compose);
  const composeTint = composeActive ? activeRailPrimary : inactiveRailTint;

  const navRows: Partial<Record<string, LeftNavRow>> = {
    home: LEFT_NAV_HOME,
    settings: LEFT_NAV_SETTINGS,
  };
  if (myProfilePubkeyUrlSafe) {
    navRows.profile = {
      ...LEFT_NAV_PROFILE,
      href: Routes.tabs.profile(myProfilePubkeyUrlSafe) as Href,
    };
  }

  const railWidth = showLabels
    ? WEB_RAIL_WIDTH_LABELED
    : WEB_RAIL_WIDTH_COLLAPSED;

  return (
    <View
      style={[
        Atoms.flex_shrink_0,
        Atoms.mt_lg,
        {
          alignSelf: 'stretch',
          width: railWidth,
        },
        Atoms.gap_sm,
      ]}
    >
      <Link href={Routes.tabs.feed.index as Href} asChild>
        <NavRailPressable
          accessibilityLabel="Polycentric home"
          style={showLabels ? { alignSelf: 'flex-start' } : undefined}
        >
          <NavRowContent
            showLabels={showLabels}
            fillRow={false}
            icon={
              <Image
                source={WEB_LOGO}
                style={[
                  Atoms.rounded_md,
                  { width: RAIL.iconSize, height: RAIL.iconSize },
                ]}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            }
            label={null}
          />
        </NavRailPressable>
      </Link>
      {LEFT_NAV_ORDER.map((navKey) => {
        const row = navRows[navKey];
        if (row == null) return null;

        const active = isLeftNavRowActive(
          pathname,
          row,
          myProfilePubkeyUrlSafe,
        );
        const iconName = active ? row.iconActive : row.icon;
        const tint = active ? activeRailPrimary : inactiveRailTint;

        return (
          <Link key={navKey} href={row.href} asChild>
            <NavRailPressable
              accessibilityLabel={row.label}
              style={showLabels ? Atoms.w_full : undefined}
            >
              <NavRowContent
                showLabels={showLabels}
                icon={
                  <Ionicons name={iconName} size={RAIL.iconSize} color={tint} />
                }
                label={
                  showLabels ? (
                    <Text
                      variant="body"
                      style={[theme.atoms.text, { color: tint, flexShrink: 1 }]}
                      numberOfLines={1}
                    >
                      {row.label}
                    </Text>
                  ) : null
                }
              />
            </NavRailPressable>
          </Link>
        );
      })}
      {showLabels ? (
        <View style={[Atoms.mt_md, Atoms.w_full]}>
          <Button
            title="New Post"
            variant="primary"
            size="md"
            fullWidth
            icon={({ size, color }) => (
              <Ionicons name="add-circle" size={size} color={color} />
            )}
            onPress={() => openCompose()}
          />
        </View>
      ) : (
        <NavRailPressable
          accessibilityLabel="New Post"
          onPress={() => openCompose()}
        >
          <NavRowContent
            showLabels={false}
            icon={
              <Ionicons
                name={composeActive ? 'add-circle' : 'add-circle-outline'}
                size={RAIL.iconSize}
                color={composeTint}
              />
            }
            label={null}
          />
        </NavRailPressable>
      )}
    </View>
  );
}
