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
  icon: IconName;
}[] = [
  { key: 'hate', name: 'Hate', icon: 'ban' },
  { key: 'selfHarm', name: 'Self-Harm', icon: 'ban' },
  { key: 'sexual', name: 'Sexual', icon: 'flag' },
  { key: 'porn', name: 'Porn', icon: 'flag' },
  { key: 'graphicMedia', name: 'Graphic Media', icon: 'ban' },
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
        gap: 4,
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderRadius: 8,
        backgroundColor: isActive ? theme.palette.primary_500 : 'transparent',
      }}
    >
      <Icon
        name={icon}
        size={14}
        color={isActive ? 'neutral_0' : 'neutral_500'}
      />
      <Text
        variant="small"
        fontWeight="medium"
        color={isActive ? 'neutral_0' : 'neutral_500'}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ModerationLabelRow({ labelKey }: { labelKey: LabelKey }) {
  const { theme } = useTheme();
  const moderation = useSettings((s) => s.moderation);
  const setModeration = useSettings((s) => s.setModeration);

  const entry = LABEL_ENTRIES.find((e) => e.key === labelKey)!;
  const currentLevel = moderation[labelKey];

  return (
    <View
      style={[
        Atoms.gap_md,
        Atoms.p_md,
        Atoms.rounded_md,
        {
          backgroundColor: withHexOpacity(theme.palette.neutral_500, '10'),
        },
      ]}
    >
      <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_md]}>
        <Icon name={entry.icon} size={20} color="neutral_700" />
        <Text variant="body" fontWeight="semibold">
          {entry.name}
        </Text>
      </View>
      <View
        style={[
          Atoms.flex_row,
          Atoms.rounded_md,
          {
            overflow: 'hidden',
            backgroundColor: withHexOpacity(theme.palette.neutral_500, '15'),
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
      <Sheet.Content style={[Atoms.gap_lg]}>
        {labelKeys.map((key) => (
          <ModerationLabelRow key={key} labelKey={key} />
        ))}
      </Sheet.Content>
    </Sheet>
  );
}

export default function ModerationSettingsScreen() {
  return <ModerationSettingsSheet />;
}
