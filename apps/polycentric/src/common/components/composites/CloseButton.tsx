import { IconButton } from '@/src/common/components/primitives';
import { Ionicons } from '@expo/vector-icons';

interface CloseButtonProps {
  onPress: () => void;
}

export function CloseButton({ onPress }: CloseButtonProps) {
  return (
    <IconButton
      icon={(props) => <Ionicons name="close" {...props} />}
      onPress={onPress}
    />
  );
}
