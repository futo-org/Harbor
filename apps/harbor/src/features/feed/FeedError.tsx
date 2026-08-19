import { Button, Text } from '@/src/common/components/primitives';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';

type FeedErrorProps = {
  message?: string;
  onRetry: () => void;
};

/** Shown in place of the posts when a feed fails to load, so the screen's
 *  topbar and tabs stay put. */
export function FeedError({
  message = 'Failed to load feed',
  onRetry,
}: FeedErrorProps) {
  return (
    <View
      style={[
        Atoms.flex_1,
        Atoms.items_center,
        Atoms.justify_center,
        Atoms.p_lg,
        Atoms.gap_lg,
      ]}
    >
      <Text color="neutral_500">{message}</Text>
      <Button title="Retry" variant="secondary" onPress={onRetry} />
    </View>
  );
}
