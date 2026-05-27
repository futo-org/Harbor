import { IconButton } from '@/src/common/components/primitives';
import Icon from '@/src/common/components/Icon';

interface BackButtonProps {
  onPress: () => void;
}

export function BackButton({ onPress }: BackButtonProps) {
  return (
    <IconButton
      icon={(props) => <Icon name="arrowBack" {...props} />}
      onPress={onPress}
    />
  );
}
