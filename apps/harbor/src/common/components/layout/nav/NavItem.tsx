import {
  Link,
  type LinkProps,
  router,
  usePathname,
  useRouter,
} from 'expo-router';
import { emitFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import {
  cloneElement,
  isValidElement,
  type ReactNode,
  useEffect,
  useState,
} from 'react';

import { useWindowDimensions, View } from 'react-native';

import { Text } from '@/src/common/components/primitives';
import { Atoms, Breakpoints, useTheme } from '@/src/common/theme';
import { flattenHref } from '@/src/utils/router';

type NavItemProps = Omit<LinkProps, 'href' | 'children'> & {
  href?: LinkProps['href'];
  icon: ReactNode;
  label: string;
  /** Overrides the width-based default (labels only above xl). */
  showLabel?: boolean;
};

export function NavItem({
  href,
  icon,
  label,
  showLabel,
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
      ? cloneElement(iconNode as React.ReactElement<{ color?: string }>, {
          color: theme.palette.neutral_900,
        })
      : iconNode;

    return (
      <View style={[{ width: 30 }, Atoms.items_center, Atoms.justify_center]}>
        {colored}
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

  const activeItemStyle = {
    backgroundColor: theme.palette.neutral_25,
  };
  const hoverItemStyle = { backgroundColor: theme.palette.neutral_50 };

  return (
    <Link
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      href={href!}
      accessibilityLabel={label}
      onPress={(e) => {
        e.preventDefault();
        // Re-tapping the current route only refreshes; navigating again
        // would remount the screen.
        if (pathname === flatHref) {
          emitFocusedRefresh();
          return;
        }
        // MH HACK!
        // Switching destination, not going deeper. Web keeps pushed screens
        // mounted and subscribed, so drop what is stacked over the tabs.
        if (router.canDismiss()) router.dismissAll();
        router.navigate(href!);
      }}
      style={[
        linkContainerStyle,
        Atoms.py_md,
        Atoms.pl_lg,
        Atoms.pr_2xl,
        !labelVisible && Atoms.pr_lg,
        Atoms.gap_md,
        isActive && activeItemStyle,
        hovering && hoverItemStyle,
      ]}
      {...props}
    >
      {renderIcon(icon)}
      {labelVisible && (
        <Text
          fontSize="lg"
          lineHeight={24}
          fontWeight={isActive ? 'bold' : 'regular'}
        >
          {label}
        </Text>
      )}
    </Link>
  );
}
