import { Text } from '@/src/common/components/primitives';
import { Atoms, useTheme, withHexOpacity, ZIndex } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { View } from 'react-native';

export function PostWarnOverlay({
  labels,
  onDismiss,
}: {
  labels: string[];
  onDismiss: () => void;
}) {
  const { theme } = useTheme();

  const labelNames = labels.join(', ');

  return (
    <View
      style={[
        Atoms.absolute,
        Atoms.inset_0,
        Atoms.justify_center,
        Atoms.items_center,
        Atoms.overflow_hidden,
        Atoms.rounded_sm,
        {
          backgroundColor: withHexOpacity(theme.palette.neutral_900, '99'),
          ...(isWeb
            ? { backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }
            : {}),
          zIndex: ZIndex.raised,
        },
      ]}
    >
      <View style={[Atoms.px_sm, { maxWidth: 320 }]}>
        {/* The text should take no more than one line, such that small post content will not cause
            overflow of content in the warning overlay */}
        <Text
          variant="secondary"
          fontSize="sm"
          lineHeight="sm"
          color="neutral_25"
          style={Atoms.text_center}
        >
          This post was labelled: {labelNames}.{' '}
          <Text
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Show post"
            variant="secondary"
            fontWeight="semibold"
            fontSize="sm"
            lineHeight="sm"
            color="primary_300"
            style={Atoms.text_underline}
          >
            Show
          </Text>
        </Text>
      </View>
    </View>
  );
}
