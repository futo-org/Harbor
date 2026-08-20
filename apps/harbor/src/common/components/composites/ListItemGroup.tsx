import { Text } from '@/src/common/components/primitives';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Children, Fragment, isValidElement } from 'react';
import { View } from 'react-native';

interface ListItemGroupProps {
  label?: string;
  children: React.ReactNode;
}

export function ListItemGroup({ label, children }: ListItemGroupProps) {
  const { theme } = useTheme();

  // Drops nulls and falsy conditionals so they can't leave a stray divider.
  const items = Children.toArray(children);

  if (items.length === 0) return null;

  const surface = withHexOpacity(theme.palette.neutral_500, '20');

  return (
    <View style={Atoms.gap_sm}>
      {label && (
        <Text variant="secondary" color="neutral_500">
          {label}
        </Text>
      )}
      <View
        style={[
          Atoms.rounded_md,
          Atoms.overflow_hidden,
          { backgroundColor: surface },
        ]}
      >
        {items.map((item, index) => (
          <Fragment key={isValidElement(item) ? item.key : index}>
            {index > 0 && (
              <View style={{ height: 1, backgroundColor: surface }} />
            )}
            {item}
          </Fragment>
        ))}
      </View>
    </View>
  );
}
