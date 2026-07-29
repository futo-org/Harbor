import { Text } from '@/src/common/components';
import Icon, { type IconName } from '@/src/common/components/Icon';
import { Sheet } from '@/src/common/components/sheet';
import {
  type ModerationLevel,
  type ModerationPreferences,
  useSettings,
} from '@/src/common/settings';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

type LabelKey = keyof ModerationPreferences;

const LABEL_ENTRIES: {
  key: LabelKey;
  name: string;
}[] = [
  { key: 'hate', name: 'Hate' },
  { key: 'selfHarm', name: 'Self-Harm' },
  { key: 'sexual', name: 'Sexual' },
  { key: 'porn', name: 'Porn' },
  { key: 'graphicMedia', name: 'Graphic Media' },
];

const LEVELS: { level: ModerationLevel; icon: IconName; label: string }[] = [
  { level: 'hide', icon: 'ban', label: 'Hide' },
  { level: 'warn', icon: 'flag', label: 'Warn' },
  { level: 'show', icon: 'checkmarkCircle', label: 'Show' },
];

function SegmentedOption({
  level,
  icon,
  label,
  isActive,
  onPress,
}: {
  level: ModerationLevel;
  icon: IconName;
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: isActive ? theme.palette.primary_500 : 'transparent',
      }}
    >
      <Icon
        name={icon}
        size={12}
        color={isActive ? 'neutral_0' : 'neutral_500'}
      />
      <Text
        variant="small"
        fontWeight="semibold"
        color={isActive ? 'neutral_0' : 'neutral_500'}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ModerationLabelRow({
  labelKey,
  index,
}: {
  labelKey: LabelKey;
  index: number;
}) {
  const { theme } = useTheme();
  const moderation = useSettings((s) => s.moderation);
  const setModeration = useSettings((s) => s.setModeration);

  const entry = LABEL_ENTRIES.find((e) => e.key === labelKey)!;
  const currentLevel = moderation[labelKey];

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.justify_between,
        Atoms.py_sm,
        Atoms.px_sm,
        Atoms.rounded_sm,
        {
          backgroundColor:
            index % 2 !== 0
              ? withHexOpacity(theme.palette.neutral_500, '20')
              : 'transparent',
        },
      ]}
    >
      <Text variant="body" fontWeight="semibold">
        {entry.name}
      </Text>
      <View
        style={[
          Atoms.flex_row,
          Atoms.rounded_md,
          {
            overflow: 'hidden',
          },
        ]}
      >
        {LEVELS.map(({ level, icon, label }) => (
          <SegmentedOption
            key={level}
            level={level}
            icon={icon}
            label={label}
            isActive={currentLevel === level}
            onPress={() => setModeration({ [labelKey]: level })}
          />
        ))}
      </View>
    </View>
  );
}
export function ModerationSettingsSheet() {
  const labelKeys = LABEL_ENTRIES.map((e) => e.key);

  return (
    <Sheet detents={[0.5, 1]} dismissible scrollable>
      <Sheet.Header
        title="Content Moderation"
        onClose={() => router.canGoBack() && router.back()}
      />
      <Sheet.Content style={[Atoms.gap_0]}>
        {labelKeys.map((key, i) => (
          <ModerationLabelRow key={key} labelKey={key} index={i} />
        ))}
      </Sheet.Content>
    </Sheet>
  );
}

export default function ModerationSettingsScreen() {
  return <ModerationSettingsSheet />;
}
