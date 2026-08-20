import { IconButton, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
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
        style={[{ fontFamily: 'monospace', flex: 1 }, Atoms.py_sm]}
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
              color={status === 'suggested' ? 'primary_500' : 'negative_500'}
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
      ? {
          borderWidth: 1,
          borderColor: withHexOpacity(theme.palette.neutral_500, '40'),
        }
      : {
          backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
        },
  ];

  return status === 'suggested' && onAction ? (
    <Pressable onPress={onAction} style={style}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}
