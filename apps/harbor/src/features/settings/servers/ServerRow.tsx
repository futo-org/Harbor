import { IconButton, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Atoms, useTheme } from '@/src/common/theme';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

interface ServerRowProps {
  server: string;
  status: 'active' | 'suggested';
  onAction?: () => void;
  // Extra content shown before the action button (e.g. a moderation
  // dashboard link). ServerRow stays agnostic about what it is.
  trailing?: ReactNode;
}

export function ServerRow({
  server,
  status,
  onAction,
  trailing,
}: ServerRowProps) {
  const { theme } = useTheme();

  const content = (
    <>
      <Text
        variant="secondary"
        monospace
        style={[{ flex: 1 }, Atoms.py_sm]}
        numberOfLines={1}
      >
        {server}
      </Text>

      {trailing}

      {onAction ? (
        <IconButton
          variant="ghost"
          compact
          icon={() => (
            <Icon
              name={status === 'suggested' ? 'addOutline' : 'remove'}
              size={22}
              color={status === 'suggested' ? 'accent' : 'danger'}
            />
          )}
          onPress={onAction}
        />
      ) : null}
    </>
  );

  const style = [
    Atoms.flex_row,
    Atoms.justify_between,
    Atoms.items_center,
    Atoms.py_sm,
    Atoms.pl_lg,
    Atoms.rounded_lg,
    status === 'suggested'
      ? [theme.atoms.outline, Atoms.border]
      : theme.atoms.box.raised.bg,
  ];

  return status === 'suggested' && onAction ? (
    <Pressable onPress={onAction} style={style}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}
