import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';
import type { ReactNode, RefAttributes } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Atoms, useTheme } from '../theme';

function DropdownMenuContent({
  style,
  ...props
}: DropdownMenuPrimitive.ContentProps &
  RefAttributes<DropdownMenuPrimitive.ContentRef>) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Overlay style={StyleSheet.absoluteFill}>
        <DropdownMenuPrimitive.Content
          // Typed as nullable, but flattening these objects never returns null
          style={
            StyleSheet.flatten([
              theme.atoms_new.box.secondary.border,
              { borderWidth: 1 },
              Atoms.rounded_lg,
              { minWidth: 225 },
              Atoms.outline_none,
              theme.atoms_new.box.secondary.bg,
              Atoms.overflow_hidden,
              typeof style === 'function' ? undefined : style,
            ]) as ViewStyle
          }
          // Keeps the menu out of the status bar and other screen cutouts
          insets={insets}
          {...props}
        />
      </DropdownMenuPrimitive.Overlay>
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  style,
  children,
  ...props
}: DropdownMenuPrimitive.ItemProps & { children: ReactNode }) {
  const { theme } = useTheme();

  return (
    <DropdownMenuPrimitive.Item style={Atoms.outline_none} {...props}>
      {({ pressed, hovered }) => (
        <View
          style={[
            Atoms.py_md,
            Atoms.px_lg,
            (pressed || hovered) && theme.atoms_new.box.secondary.bg_hover,
            Atoms.flex_row,
            Atoms.align_center,
            Atoms.gap_lg,
            props.disabled && theme.atoms_new.faded,
          ]}
        >
          {children}
        </View>
      )}
    </DropdownMenuPrimitive.Item>
  );
}

function DropdownMenu({ children }: DropdownMenuPrimitive.RootProps) {
  return <DropdownMenuPrimitive.Root>{children}</DropdownMenuPrimitive.Root>;
}
DropdownMenu.Trigger = DropdownMenuPrimitive.Trigger;
DropdownMenu.Content = DropdownMenuContent;
DropdownMenu.Item = DropdownMenuItem;

export default DropdownMenu;
