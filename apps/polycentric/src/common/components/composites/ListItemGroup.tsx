import { Box } from '@/src/common/components/layouts';
import { Text } from '@/src/common/components/primitives';

interface ListItemGroupProps {
  label?: string;
  children: React.ReactNode;
}

export function ListItemGroup({ label, children }: ListItemGroupProps) {
  return (
    <Box gap="sm">
      {label && (
        <Text variant="secondary" color="neutralSurface">
          {label}
        </Text>
      )}
      {children}
    </Box>
  );
}
