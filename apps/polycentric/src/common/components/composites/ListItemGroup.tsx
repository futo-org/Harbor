import { Text } from '@/src/common/components/primitives';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';

interface ListItemGroupProps {
  label?: string;
  children: React.ReactNode;
}

export function ListItemGroup({ label, children }: ListItemGroupProps) {
  return (
    <View style={Atoms.gap_sm}>
      {label && (
        <Text variant="secondary" color="neutral_500">
          {label}
        </Text>
      )}
      {children}
    </View>
  );
}
