import { Atoms } from '@/src/common/theme';
import { type ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from './primitives';

export function ListEmpty({ children }: { children: ReactNode }) {
  return (
    <View
      style={[
        Atoms.flex_1,
        Atoms.items_center,
        Atoms.justify_center,
        Atoms.p_lg,
      ]}
    >
      {typeof children === 'string' ? (
        <Text variant="body" color="neutral_500">
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
