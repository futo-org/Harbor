import { IconButton } from '@/src/common/components/primitives';
import Icon from '@/src/common/components/Icon';

interface CloseButtonProps {
  onPress: () => void;
}

export function CloseButton({ onPress }: CloseButtonProps) {
  return (
    <IconButton
      icon={(props) => <Icon name="close" {...props} />}
      onPress={onPress}
    />
  );
}
