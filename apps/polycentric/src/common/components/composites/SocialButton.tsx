import { PillButton } from '@/src/common/components/primitives';
import Icon, { type IconName } from '@/src/common/components/Icon';

type SocialAction = 'follow' | 'unfollow' | 'block' | 'unblock';

interface SocialButtonProps {
  action: SocialAction;
  onPress: () => void;
}

const CONFIG: Record<
  SocialAction,
  {
    title: string;
    icon: IconName;
    variant: 'primary' | 'secondary' | 'destructive';
  }
> = {
  follow: {
    title: 'Follow',
    icon: 'personAdd',
    variant: 'primary',
  },
  unfollow: {
    title: 'Unfollow',
    icon: 'personRemove',
    variant: 'primary',
  },
  block: {
    title: 'Block',
    icon: 'ban',
    variant: 'destructive',
  },
  unblock: {
    title: 'Unblock',
    icon: 'checkmarkCircle',
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
      icon={(props) => <Icon name={icon} {...props} />}
    />
  );
}
