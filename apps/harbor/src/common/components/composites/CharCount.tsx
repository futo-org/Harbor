import { Text } from '@/src/common/components/primitives';
import { Atoms } from '@/src/common/theme';

export function CharCount({ count, max }: { count: number; max: number }) {
  return (
    <Text
      variant="small"
      color={count >= max ? 'negative_500' : 'neutral_500'}
      style={Atoms.text_right}
    >
      {count}/{max}
    </Text>
  );
}
