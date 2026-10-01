import type { ComponentProps } from 'react';
import { Text, type TextVariant } from './Text';
import { shortenIdentityId } from '@/src/common/lib/polycentric-hooks';

interface IdentityTagProps {
  /** v2 identity id (hex sha256 of the initial Identity content). */
  identity: string | undefined;
  variant?: TextVariant;
  style?: ComponentProps<typeof Text>['style'];
}

export function IdentityTag({
  identity,
  variant = 'secondary',
  style,
}: IdentityTagProps) {
  return (
    <Text
      variant={variant}
      color="neutral_500"
      style={[{ fontFamily: 'monospace' }, style]}
    >
      {shortenIdentityId(identity)}
    </Text>
  );
}
