import { Link, type LinkProps, router, usePathname } from 'expo-router';
import { emitFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import {
  cloneElement,
  isValidElement,
  type ReactNode,
  useEffect,
  useState,
} from 'react';

import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text } from '@/src/common/components/primitives';
import {
  Atoms,
  Breakpoints,
  type TextColor,
  useTheme,
} from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { flattenHref } from '@/src/utils/router';
import { useNavDrawerStore } from './drawer/hooks/useNavDrawerStore';

type NavItemProps = Omit<LinkProps, 'href' | 'children'> & {
  href?: LinkProps['href'];
  icon: ReactNode;
  label: string;
  /** Overrides the width-based default (labels only above xl). */
  showLabel?: boolean;
  large?: boolean;
  /** Counter drawn over the icon. */
  badge?: string | null;
};

export function NavItem({
  href,
  icon,
  label,
  showLabel,
  large,
  badge,
  ...props
}: NavItemProps) {
  const { theme } = useTheme();

  const { width: deviceWidth } = useWindowDimensions();

  const labelVisible = showLabel ?? deviceWidth > Breakpoints.xl;

  const flatHref = flattenHref(href);
  const pathname = usePathname();
  const [hovering, setHovering] = useState(false);
  const isActive = flatHref && pathname.startsWith(flatHref);

  const [open, setOpen] = useState(isActive);

  useEffect(() => {
    if (!isActive) {
      setOpen(false);
    }
  }, [isActive]);

  // Wrap the icon that is provided
  const renderIcon = (iconNode?: ReactNode): ReactNode => {
    if (!iconNode) return null;

    const colored = isValidElement(iconNode)
      ? cloneElement(iconNode as React.ReactElement<{ color?: TextColor }>, {
          color: 'primary',
        })
      : iconNode;

    return (
      <View
        style={[
          { width: large ? 34 : 30 },
          Atoms.items_center,
          Atoms.justify_center,
        ]}
      >
        {colored}
        {badge && (
          <View
            style={[
              Atoms.absolute,
              Atoms.rounded_full,
              Atoms.px_xs,
              Atoms.items_center,
              Atoms.justify_center,
              {
                top: -6,
                right: -8,
                minWidth: 18,
                height: 18,
              },
              theme.atoms.box.accent.bg,
            ]}
          >
            <Text fontSize="xs" lineHeight={18} fontWeight="bold" color="light">
              {badge}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const linkContainerStyle = [
    Atoms.rounded_full,
    Atoms.flex,
    Atoms.self_start,
    Atoms.flex_row,
    Atoms.align_center,
    Atoms.gap_sm,
  ];

  const style = [
    linkContainerStyle,
    Atoms.py_md,
    Atoms.pl_lg,
    Atoms.pr_2xl,
    !labelVisible && Atoms.pr_lg,
    Atoms.gap_md,
    isActive
      ? theme.atoms.box.secondary.bg
      : hovering && theme.atoms.box.secondary.bg_hover,
  ];

  const content = (
    <>
      {renderIcon(icon)}
      {labelVisible && (
        <Text
          fontSize={large ? 'xl' : 'lg'}
          lineHeight={large ? 28 : 24}
          fontWeight={isActive ? 'bold' : 'regular'}
        >
          {label}
        </Text>
      )}
    </>
  );

  const onPress: LinkProps['onPress'] = (e) => {
    e.preventDefault();
    // Re-tapping the current route only refreshes; navigating again
    // would remount the screen.
    if (pathname === flatHref) {
      useNavDrawerStore.getState().hide();
      emitFocusedRefresh();
      return;
    }
    // MH HACK!
    // Switching destination, not going deeper. Web keeps pushed screens
    // mounted and subscribed, so drop what is stacked over the tabs.
    if (router.canDismiss()) router.dismissAll();
    router.navigate(href!);
  };

  if (!isWeb) {
    return (
      <Link href={href!} onPress={onPress} asChild {...props}>
        <Pressable
          accessibilityLabel={label}
          onPressIn={() => setHovering(true)}
          onPressOut={() => setHovering(false)}
          style={StyleSheet.flatten([style, Atoms.self_stretch])}
        >
          {content}
        </Pressable>
      </Link>
    );
  }

  return (
    <Link
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      href={href!}
      accessibilityLabel={label}
      onPress={onPress}
      style={style}
      {...props}
    >
      {content}
    </Link>
  );
}
