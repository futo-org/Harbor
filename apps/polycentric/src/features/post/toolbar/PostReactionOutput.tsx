import { Text } from '@/src/common/components';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import useReactions from '../../reaction/useReactions';

type PostReactionOutputProps = {
  post: PostData;
};
export default function PostReactionOutput({ post }: PostReactionOutputProps) {
  const store = useReactions();

  const reaction = store.getReaction(post.id);

  return (
    <View style={[Atoms.flex_row, Atoms.align_center, { opacity: 0.9 }]}>
      <Text style={{ fontSize: 12 }}>{reaction?.emoji}</Text>
      {/* <Text style={{ fontSize: 16, marginLeft: -4 }}>❤️</Text> */}
    </View>
  );
}
