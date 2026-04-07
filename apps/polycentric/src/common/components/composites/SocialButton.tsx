import { PillButton } from '@/src/common/components/primitives';
import { Ionicons } from '@expo/vector-icons';

type SocialAction = 'follow' | 'unfollow' | 'block' | 'unblock';

interface SocialButtonProps {
  action: SocialAction;
  onPress: () => void;
}

const CONFIG: Record<
  SocialAction,
  {
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    variant: 'primary' | 'secondary' | 'destructive';
  }
> = {
  follow: {
    title: 'Follow',
    icon: 'person-add',
    variant: 'primary',
  },
  unfollow: {
    title: 'Unfollow',
    icon: 'person-remove',
    variant: 'primary',
  },
  block: {
    title: 'Block',
    icon: 'ban',
    variant: 'destructive',
  },
  unblock: {
    title: 'Unblock',
    icon: 'checkmark-circle',
    variant: 'secondary',
  },
};

export function SocialButton({ action, onPress }: SocialButtonProps) {
  const { title, icon, variant } = CONFIG[action];

  return (
    <PillButton
      onPress={onPress}
      title={title}
      variant={variant}
      icon={(props) => <Ionicons name={icon} {...props} />}
    />
  );
}
