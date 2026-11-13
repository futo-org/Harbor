import { IconButton } from '@/src/common/components/primitives';

interface CloseButtonProps {
  onPress: () => void;
}

export function CloseButton({ onPress }: CloseButtonProps) {
  return <IconButton icon="close" onPress={onPress} />;
}
