import { BackButton, Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import { Atoms } from '@/src/common/theme';
import { ConversationView } from '@/src/features/post/ConversationView';
import { usePostById } from '@/src/features/post/hooks/usePostById';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function FeedPostScreen() {
  const { identityId, postId: sequenceParam } = useLocalSearchParams<{
    identityId: string;
    postId: string;
  }>();

  const { post, isLoading } = usePostById(identityId, sequenceParam);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  if (isLoading) {
    return (
      <Screen>
        <Screen.PrimaryColumn>
          <View style={[Atoms.mx_lg, Atoms.mt_lg]}>
            <BackButton onPress={handleBack} />
            <View style={[Atoms.items_center, Atoms.mt_lg]}>
              <ActivityIndicator />
            </View>
          </View>
        </Screen.PrimaryColumn>
      </Screen>
    );
  }

  if (!post) {
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
          <ConversationView post={post} />
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
