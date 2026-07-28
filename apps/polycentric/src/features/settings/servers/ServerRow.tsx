import { IconButton, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Pressable, View } from 'react-native';

interface ServerRowProps {
  server: string;
  action: 'add' | 'remove';
  onAction: () => void;
}

export function ServerRow({ server, action, onAction }: ServerRowProps) {
  const { theme } = useTheme();
  const isAdd = action === 'add';

  const content = (
    <>
      <Text
        variant="secondary"
        style={{ fontFamily: 'monospace', flex: 1 }}
        numberOfLines={1}
      >
        {server}
      </Text>
      <IconButton
        variant="ghost"
        compact
        icon={() => (
          <Icon
            name={isAdd ? 'addOutline' : 'remove'}
            size={22}
            color={isAdd ? 'primary_500' : 'negative_500'}
          />
        )}
        onPress={onAction}
      />
    </>
  );

  const style = [
    Atoms.flex_row,
    Atoms.justify_between,
    Atoms.items_center,
    Atoms.py_sm,
    Atoms.pl_lg,
    Atoms.rounded_lg,
    isAdd
      ? {
          borderWidth: 1,
          borderColor: withHexOpacity(theme.palette.neutral_500, '40'),
        }
      : {
          backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
        },
  ];

  return isAdd ? (
    <Pressable onPress={onAction} style={style}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}
