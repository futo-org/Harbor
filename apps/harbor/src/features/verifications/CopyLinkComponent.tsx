import { Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { useCopyToClipboard } from '@/src/common/lib/useCopyToClipboard';
import { Atoms, useTheme } from '@/src/common/theme';
import { Pressable } from 'react-native';

export function CopyLinkComponent({ link }: { link: string }) {
  const { theme } = useTheme();
  const { copyToClipboard, justCopied } = useCopyToClipboard({
    showToast: true,
  });

  return (
    <Pressable
      onPress={() => copyToClipboard(link)}
      style={({ hovered }) => [
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.gap_sm,
        Atoms.p_md,
        Atoms.rounded_md,
        {
          backgroundColor: hovered
            ? theme.palette.neutral_200
            : theme.palette.neutral_100,
        },
      ]}
    >
      <Text
        variant="body"
        // Identity keys make the link too long to fit; it's here to copy.
        numberOfLines={1}
        style={[Atoms.flex_1, theme.atoms.text, { fontFamily: 'monospace' }]}
      >
        {link}
      </Text>
      <Icon
        name={justCopied ? 'checkmark' : 'copy'}
        size={18}
        color={justCopied ? 'positive_500' : 'neutral_500'}
      />
    </Pressable>
  );
}
