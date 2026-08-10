import { Text } from '@/src/common/components/primitives/Text';
import Icon, { type IconName } from '@/src/common/components/Icon';
import {
  Atoms,
  type PaletteColorToken,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { Pressable, type PressableProps, View } from 'react-native';

type PostActionButtonProps = {
  icon: IconName;
  count?: number;
  active?: boolean;
  highlighted?: boolean;
  color?: PaletteColorToken;
} & Omit<PressableProps, 'style' | 'children'>;

export default function PostActionButton({
  icon,
  count,
  active = false,
  highlighted = false,
  color = 'neutral_500',
  ...props
}: PostActionButtonProps) {
  const { theme } = useTheme();

  return (
    <View style={[Atoms.flex_row, Atoms.justify_start]}>
      <Pressable
        {...props}
        style={[Atoms.flex_row, Atoms.outline_none, Atoms.items_center]}
        hitSlop={8}
      >
        {({ pressed, hovered }) => {
          const isHighlighted = hovered || pressed || highlighted;
          return (
            <>
              <View
                style={[
                  Atoms.p_xs,
                  Atoms.rounded_full,
                  // overflow:hidden forces a rounded clip on native
                  Atoms.overflow_hidden,
                  {
                    backgroundColor: isHighlighted
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
                  color={active || highlighted ? color : 'neutral_500'}
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
