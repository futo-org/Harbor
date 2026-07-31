import * as PopoverPrimitive from '@rn-primitives/popover';
import type { ReactNode } from 'react';

export function PopoverContent({ children }: { children: ReactNode }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content>{children}</PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

function Popover({ children }: { children: ReactNode }) {
  return <PopoverPrimitive.Root>{children}</PopoverPrimitive.Root>;
}

Popover.Trigger = PopoverPrimitive.Trigger;
Popover.Content = PopoverContent;

export default Popover;
