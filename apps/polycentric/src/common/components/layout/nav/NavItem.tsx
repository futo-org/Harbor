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

import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { Atoms, Breakpoints, useTheme } from '@/src/common/theme';
import { flattenHref } from '@/src/utils/router';

type NavItemProps = Omit<LinkProps, 'href' | 'children'> & {
  href?: LinkProps['href'];
  icon: ReactNode;
  label: string;
};

export function NavItem({ href, icon, label, ...props }: NavItemProps) {
  const { theme } = useTheme();

  const { width: deviceWidth } = useWindowDimensions();

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
  const labelStyle = [
    Atoms.font_semibold,
    Atoms.text_2xl,
    { color: theme.palette.neutral_900 },
  ];

  return (
    <Link
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      href={href!}
      onPress={(e) => {
        e.preventDefault();
        if (isActive) emitFocusedRefresh();
        router.navigate(href!);
      }}
      style={[
        linkContainerStyle,
        Atoms.py_md,
        Atoms.pl_lg,
        Atoms.pr_2xl,
        deviceWidth <= Breakpoints.xl && Atoms.pr_lg,
        Atoms.gap_md,
        isActive && activeItemStyle,
        hovering && hoverItemStyle,
      ]}
      {...props}
    >
      {renderIcon(icon)}
      {deviceWidth > Breakpoints.xl && <Text style={labelStyle}>{label}</Text>}
    </Link>
  );
}
