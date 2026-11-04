import { Text } from '@/src/common/components/primitives/Text';
import type { ComponentProps } from 'react';
import { useIdentityHandle } from './hooks/useIdentityHandle';

type IdentityHandleProps = Omit<
  ComponentProps<typeof Text>,
  'children' | 'numberOfLines'
> & {
  identity: string | null | undefined;
};

/** Every identity alias or shortened id in the app renders through this. */
export function IdentityHandle({
  identity,
  style,
  ...textProps
}: IdentityHandleProps) {
  const handle = useIdentityHandle(identity);

  return (
    <Text
      {...textProps}
      numberOfLines={1}
      monospace={handle.kind === 'hash'}
      style={[
        style,
        // Not verified yet
        handle.kind === 'alias-pending' && { opacity: 0.5 },
      ]}
    >
      {handle.text}
    </Text>
  );
}
