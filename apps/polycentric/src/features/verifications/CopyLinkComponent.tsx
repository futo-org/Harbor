import { Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { useToast } from '@/src/common/components/toast';
import { Atoms, useTheme } from '@/src/common/theme';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';

export function CopyLinkComponent({ link }: { link: string }) {
  const { theme } = useTheme();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  const onCopy = () => {
    void Clipboard.setStringAsync(link);
    setCopied(true);
    toast.success('Copied to clipboard');
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Pressable
      onPress={onCopy}
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
        style={[Atoms.flex_1, theme.atoms.text, { fontFamily: 'monospace' }]}
      >
        {link}
      </Text>
      <Icon
        name={copied ? 'checkmark' : 'copy'}
        size={18}
        color={copied ? 'positive_500' : 'neutral_500'}
      />
    </Pressable>
  );
}
