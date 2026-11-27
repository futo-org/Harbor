import { Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import { Atoms } from '@/src/common/theme';
import { useHead } from '@/src/common/lib/head/useHead';
import { ThreadList } from '@/src/features/post/ThreadList';
import { usePostById } from '@/src/features/post/hooks/usePostById';
import { usePostHead } from '@/src/features/post/head/usePostHead';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

export default function FeedPostScreen() {
  const {
    identityId,
    keyFingerprint,
    sequence = '',
  } = useLocalSearchParams<{
    identityId: string;
    keyFingerprint: string;
    sequence: string;
  }>();

  const { post, isLoading } = usePostById(
    identityId,
    keyFingerprint,
    BigInt(sequence),
  );

  useHead(usePostHead(post, isLoading));

  if (!post) {
    return (
      <Screen>
        <Screen.PrimaryColumn>
          <Screen.Topbar title="Post" />
          {isLoading ? null : (
            <View style={[Atoms.items_center, Atoms.py_3xl]}>
              <Text color="muted">Post not found.</Text>
            </View>
          )}
        </Screen.PrimaryColumn>
      </Screen>
    );
  }

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={Atoms.flex_1}>
          <ThreadList
            post={post}
            HeaderComponent={<Screen.Topbar title="Post" />}
          />
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
