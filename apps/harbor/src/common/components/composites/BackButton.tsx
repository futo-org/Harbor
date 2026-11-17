import { IconButton } from '@/src/common/components/primitives';

interface BackButtonProps {
  onPress: () => void;
}

export function BackButton({ onPress }: BackButtonProps) {
  return <IconButton icon="arrowBack" onPress={onPress} />;
}
