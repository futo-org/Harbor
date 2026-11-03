import { IconButton, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

interface ServerRowProps {
  server: string;
  status: 'active' | 'suggested';
  onAction?: () => void;
  // Pressing the row (not its action button). Suggested rows default to `onAction`.
  onPress?: () => void;
  // Extra content shown before the action button (e.g. a moderation
  // dashboard link). ServerRow stays agnostic about what it is.
  trailing?: ReactNode;
  // Content shown under the row (used for server push issues)
  children?: ReactNode;
}

export function ServerRow({
  server,
  status,
  onAction,
  onPress,
  trailing,
  children,
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
              color={status === 'suggested' ? 'primary_500' : 'negative_500'}
            />
          )}
          onPress={onAction}
        />
      ) : null}
    </>
  );

  const rowStyle = [
    Atoms.flex_row,
    Atoms.justify_between,
    Atoms.items_center,
    Atoms.py_sm,
    Atoms.pl_lg,
  ];

  const containerStyle = [
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

  const handlePress =
    onPress ?? (status === 'suggested' ? onAction : undefined);

  const row = handlePress ? (
    <Pressable onPress={handlePress} style={rowStyle}>
      {content}
    </Pressable>
  ) : (
    <View style={rowStyle}>{content}</View>
  );

  return (
    <View style={containerStyle}>
      {row}
      {children}
    </View>
  );
}
