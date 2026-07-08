import { Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Atoms, useTheme } from '@/src/common/theme';
import { Pressable, View } from 'react-native';

// An action row styled like a claim list row.
export function ClaimActionRow({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ hovered, pressed }) => [
        (hovered || pressed) && {
          backgroundColor: theme.palette.neutral_25,
        },
      ]}
    >
      <View
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.gap_md,
          Atoms.pl_lg,
          Atoms.pr_lg,
          Atoms.pt_md,
          Atoms.pb_md,
          { borderBottomWidth: 1, borderColor: theme.palette.neutral_25 },
        ]}
      >
        <View style={Atoms.flex_1}>
          <Text
            variant="secondary"
            fontWeight="semibold"
            color="primary_500"
            selectable={false}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              variant="small"
              style={theme.atoms.text_neutral_medium}
              fontWeight="regular"
              selectable={false}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Icon name="chevronForward" size={28} color="neutral_400" />
      </View>
    </Pressable>
  );
}
