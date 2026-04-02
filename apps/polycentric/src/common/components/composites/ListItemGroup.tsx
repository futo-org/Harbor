import { Box } from '@/src/common/components/layouts';
import { Text } from '@/src/common/components/primitives';
import { Atoms } from '@/src/common/theme';

interface ListItemGroupProps {
  label?: string;
  children: React.ReactNode;
}

export function ListItemGroup({ label, children }: ListItemGroupProps) {
  return (
    <Box style={Atoms.gap_sm}>
      {label && (
        <Text variant="secondary" color="neutral_500">
          {label}
        </Text>
      )}
      {children}
    </Box>
  );
}
