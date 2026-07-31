import type { ComponentProps } from 'react';
import { Text } from './Text';
import { shortenIdentityId } from '@/src/common/lib/polycentric-hooks';

interface IdentityTagProps {
  /** v2 identity id (hex sha256 of the initial Identity content). */
  identity: string | undefined;
  compact?: ComponentProps<typeof Text>['compact'];
  style?: ComponentProps<typeof Text>['style'];
}

export function IdentityTag({ identity, compact, style }: IdentityTagProps) {
  return (
    <Text
      variant="secondary"
      color="neutral_500"
      compact={compact}
      style={[{ fontFamily: 'monospace' }, style]}
    >
      {shortenIdentityId(identity)}
    </Text>
  );
}
