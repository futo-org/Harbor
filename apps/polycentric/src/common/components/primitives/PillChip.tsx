import { type ComponentProps } from 'react';
import { Text } from './Text';
import { shortenIdentityId } from '@/src/common/lib/polycentric-hooks';

interface IdentityTagProps {
  /** v2 identity id (hex sha256 of the initial Identity content). */
  identity: string | undefined;
  style?: ComponentProps<typeof Text>['style'];
}

export function IdentityTag({ identity, style }: IdentityTagProps) {
  return (
    <Text
      variant="secondary"
      color="neutral_500"
      style={[{ fontFamily: 'monospace' }, style]}
    >
      {shortenIdentityId(identity)}
    </Text>
  );
}
