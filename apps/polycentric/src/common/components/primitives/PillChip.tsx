import { type ComponentProps } from 'react';
import { Text } from './Text';
import {
  getIdentityIdShort,
  shortenIdentityId,
} from '@/src/common/lib/polycentric-hooks';
import { types } from '@polycentric/react-native';

interface PubkeyTagProps {
  publicKey: types.PublicKey;
  /**
   * v2 identity id (hex sha256 of the initial Identity content). When
   * provided, the tag renders a short form of this identity instead of the
   * signer's public key — this is what users should actually see.
   */
  identity?: string;
  style?: ComponentProps<typeof Text>['style'];
}

export function PubkeyTag({ publicKey, identity, style }: PubkeyTagProps) {
  const label = identity
    ? shortenIdentityId(identity)
    : getIdentityIdShort(publicKey);

  return (
    <Text
      variant="secondary"
      color="neutral_500"
      style={[{ fontFamily: 'monospace' }, style]}
    >
      {label}
    </Text>
  );
}
