import { BackButton, Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import {
  postIdToSequence,
  usePolycentricContext,
  useStore,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { ConversationView } from '@/src/features/post/ConversationView';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

export default function FeedPostScreen() {
  const { identityId, postId: sequenceParam } = useLocalSearchParams<{
    identityId: string;
    postId: string;
  }>();

  const { store } = usePolycentricContext();
  const resolvedPostId = useStore(store, (state) => {
    if (!identityId || !sequenceParam) return null;
    for (const [key, post] of Object.entries(state.posts)) {
      if (
        post.decoded.authorIdentity === identityId &&
        postIdToSequence(key) === sequenceParam
      ) {
        return key;
      }
    }
    return null;
  });

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  if (!sequenceParam || !resolvedPostId) {
    return (
      <Screen>
        <Screen.PrimaryColumn>
          <View style={[Atoms.mx_lg, Atoms.mt_lg]}>
            <BackButton onPress={handleBack} />
            <View style={Atoms.mt_lg}>
              <Text>Invalid post reference</Text>
            </View>
          </View>
        </Screen.PrimaryColumn>
      </Screen>
    );
  }

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.mx_lg, Atoms.mt_lg]}>
          <BackButton onPress={handleBack} />
        </View>
        <View style={[Atoms.flex_1, Atoms.mt_md]}>
          <ConversationView postId={resolvedPostId} />
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
