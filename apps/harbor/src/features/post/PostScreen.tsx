import { BackButton, Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import { Atoms } from '@/src/common/theme';
import { ThreadList } from '@/src/features/post/ThreadList';
import { usePostById } from '@/src/features/post/hooks/usePostById';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';

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

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  if (isLoading && !post) {
    return (
      <Screen>
        <Screen.PrimaryColumn>
          <View style={[Atoms.mx_lg, Atoms.mt_lg]}>
            <BackButton onPress={handleBack} />
            <View style={[Atoms.items_center, Atoms.py_3xl]}>
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
            <View style={[Atoms.items_center, Atoms.py_3xl]}>
              <Text color="neutral_500">Post not found.</Text>
            </View>
          </View>
        </Screen.PrimaryColumn>
      </Screen>
    );
  }

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_1, Atoms.mt_md]}>
          <ThreadList
            post={post}
            HeaderComponent={<Screen.Topbar title="Post" />}
          />
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
