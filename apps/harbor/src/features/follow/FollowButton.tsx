import { Button } from '@/src/common/components/primitives/Button';
import { withIdentity } from '@/src/common/lib/authGate';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import useFollows from './hooks/useFollows';

type FollowButtonProps = {
  identity: string;
};

export default function FollowButton({ identity }: FollowButtonProps) {
  const client = usePolycentric();
  const { isFollowing, addFollow, removeFollow } = useFollows();

  const following = isFollowing(identity);

  return (
    <Button
      title={following ? 'Following' : 'Follow'}
      variant={following ? 'secondary' : 'primary'}
      size="sm"
      onPress={() =>
        withIdentity(() => {
          if (following) {
            void removeFollow(client, identity);
          } else {
            void addFollow(client, identity);
          }
        })
      }
    />
  );
}
