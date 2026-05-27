import { Text } from '@/src/common/components';
import Icon, { IconName } from '@/src/common/components/Icon';
import {
  Atoms,
  PaletteColorToken,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { Pressable, PressableProps, View } from 'react-native';

type PostActionButtonProps = {
  icon: IconName;
  count?: number;
  active?: boolean;
  color?: PaletteColorToken;
} & Omit<PressableProps, 'style' | 'children'>;

export default function PostActionButton({
  icon,
  count,
  active = false,
  color = 'neutral_500',
  ...props
}: PostActionButtonProps) {
  const { theme } = useTheme();

  return (
    <View style={[Atoms.flex_1, Atoms.flex_row, Atoms.justify_start]}>
      <Pressable
        {...props}
        style={[Atoms.flex_row, Atoms.outline_none, Atoms.items_center]}
        hitSlop={8}
      >
        {({ pressed, hovered }) => {
          const highlighted = hovered || pressed;
          return (
            <>
              <View
                style={[
                  Atoms.p_xs,
                  Atoms.rounded_full,
                  // overflow:hidden forces a rounded clip on native - without it a
                  // background applied on press (rather than at mount, like the
                  // active state) renders with square corners.
                  Atoms.overflow_hidden,
                  {
                    backgroundColor: highlighted
                      ? withHexOpacity(theme.palette[color], '14')
                      : active
                        ? withHexOpacity(theme.palette[color], '28')
                        : 'transparent',
                  },
                ]}
              >
                <Icon
                  name={icon}
                  size={16}
                  color={active || highlighted ? color : 'neutral_500'}
                />
              </View>
              {count !== undefined ? (
                <Text
                  variant="small"
                  color="neutral_500"
                  style={{ minWidth: 28, lineHeight: 16 }}
                >
                  {count ? String(count) : ' '}
                </Text>
              ) : null}
            </>
          );
        }}
      </Pressable>
    </View>
  );
}
