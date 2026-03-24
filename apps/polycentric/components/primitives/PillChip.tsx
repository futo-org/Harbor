import { type ComponentProps } from 'react';
import { Text } from './Text';
import { getIdentityIdShort } from '@/lib/polycentric-hooks';
import { types } from '@polycentric/react-native';

interface PubkeyTagProps {
  publicKey: types.PublicKey;
  style?: ComponentProps<typeof Text>['style'];
}

export function PubkeyTag({ publicKey, style }: PubkeyTagProps) {
  const label = getIdentityIdShort(publicKey);

  return (
    <Text
      variant="secondary"
      color="neutralSurface"
      style={[{ fontFamily: 'monospace' }, style]}
    >
      {label}
    </Text>
  );
}
