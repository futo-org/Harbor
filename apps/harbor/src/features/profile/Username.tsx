import { Text } from '@/src/common/components/primitives/Text';
import { useUsername } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { LabelPill } from '@/src/features/moderation/LabelPill';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { useProfileModeration } from './hooks/useProfileModeration';

type UsernameProps = Omit<ComponentProps<typeof Text>, 'children'> & {
  identity: string | null | undefined;
  fallbackName?: string | null;
};

/** Every display name in the app renders through this. */
export function Username({
  identity,
  fallbackName,
  numberOfLines = 1,
  variant = 'body',
  style,
  ...textProps
}: UsernameProps) {
  const { obscured, revealed, warnLabels, reveal, hide } =
    useProfileModeration(identity);
  const name = useUsername(identity, { fallbackName });

  // The label pill stands in for the name until revealed, then follows it.
  if (obscured) {
    return <LabelPill labels={warnLabels} action="Show" onPress={reveal} />;
  }

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_2xs,
        Atoms.flex_shrink_1,
      ]}
    >
      {name ? (
        <Text
          {...textProps}
          variant={variant}
          numberOfLines={numberOfLines}
          style={[Atoms.flex_shrink_1, style]}
        >
          {name}
        </Text>
      ) : null}
      {revealed ? (
        <LabelPill labels={warnLabels} action="Hide" onPress={hide} />
      ) : null}
    </View>
  );
}
