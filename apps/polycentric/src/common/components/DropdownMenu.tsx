import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';
import React, { ReactNode, useState } from 'react';
import { View } from 'react-native';

import { Atoms, useTheme } from '../theme';

function DropdownMenuContent({
  style,
  ...props
}: DropdownMenuPrimitive.ContentProps &
  React.RefAttributes<DropdownMenuPrimitive.ContentRef>) {
  const { theme } = useTheme();

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Overlay>
        <DropdownMenuPrimitive.Content
          style={(state) => [
            { borderWidth: 1, borderColor: theme.palette.neutral_50 },
            Atoms.rounded_lg,
            { minWidth: 256 },
            //Atoms.outline_none,
            { backgroundColor: theme.palette.neutral_25 },
            Atoms.overflow_hidden,
            typeof style === 'function' ? style(state) : style,
          ]}
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
  const [hovered, setHovering] = useState(false);

  return (
    <DropdownMenuPrimitive.Item
      style={{ outline: 'none' }}
      onHoverIn={() => setHovering(true)}
      onHoverOut={() => setHovering(false)}
      {...props}
    >
      <View
        style={[
          Atoms.py_md,
          Atoms.px_lg,
          hovered && { backgroundColor: theme.palette.neutral_50 },
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.gap_lg,
        ]}
      >
        {children}
      </View>
    </DropdownMenuPrimitive.Item>
  );
}

function DropdownMenu({ children }: { children: ReactNode }) {
  return <DropdownMenuPrimitive.Root>{children}</DropdownMenuPrimitive.Root>;
}
DropdownMenu.Trigger = DropdownMenuPrimitive.Trigger;
DropdownMenu.Content = DropdownMenuContent;
DropdownMenu.Item = DropdownMenuItem;

export default DropdownMenu;
