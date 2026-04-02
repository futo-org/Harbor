import { IconButton } from '@/src/common/components/primitives';
import { Ionicons } from '@expo/vector-icons';

interface BackButtonProps {
  onPress: () => void;
}

export function BackButton({ onPress }: BackButtonProps) {
  return (
    <IconButton
      icon={(props) => <Ionicons name="arrow-back" {...props} />}
      onPress={onPress}
    />
  );
}
