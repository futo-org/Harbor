import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FeedPost } from './Post';
import { signedEventToHex } from '../hooks';
import type { PostData } from '../hooks';
import type { RootStackParamList } from '../App';
import { usePolycentricContext } from '../hooks';

interface ReplyItemProps {
  postId: string;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Post'>;
  onReply: (post: PostData) => void;
}

export function ReplyItem({ postId, navigation, onReply }: ReplyItemProps) {
  const { store } = usePolycentricContext();

  return (
    <FeedPost
      postId={postId}
      onPress={() => {
        const ps = store.getState().posts[postId];
        if (ps) {
          navigation.push('Post', {
            signedEventHex: signedEventToHex(ps.signedEvent),
          });
        }
      }}
      onReply={onReply}
      hideReplyingTo
    />
  );
}
