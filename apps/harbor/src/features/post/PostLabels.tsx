import { Text } from '@/src/common/components/primitives';
import { MODERATION_LABELS } from '@/src/common/settings';
import { Atoms, useTheme } from '@/src/common/theme';
import { View } from 'react-native';

export function PostLabels({ labels }: { labels: string[] }) {
  const { theme } = useTheme();
  return (
    <View style={[Atoms.flex_row, Atoms.gap_xs, Atoms.flex_wrap, Atoms.mt_sm]}>
      {labels.map((label) => {
        const isModerationLabel = (
          MODERATION_LABELS as readonly string[]
        ).includes(label);
        const bg = isModerationLabel ? theme.palette.warning_25 : undefined;
        const textColor = isModerationLabel
          ? theme.palette.warning_700
          : undefined;

        return (
          <View
            key={label}
            style={[
              {
                backgroundColor: bg,
                borderRadius: 4,
                paddingHorizontal: 6,
                paddingVertical: 2,
              },
            ]}
          >
            <Text
              variant="small"
              style={[{ color: textColor, fontSize: 11, lineHeight: 16 }]}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
