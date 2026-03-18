import { Screen, Box, Text, Button, PageHeader } from '@/components';
import { useRouter } from 'expo-router';
import { useSignup } from '@/lib/signup/SignupContext';

type ModerationLevel = 1 | 2 | 3;

const MODERATION_LABELS: Record<ModerationLevel, string> = {
  1: 'Strict',
  2: 'Moderate',
  3: 'Relaxed',
};

export default function SetModeration() {
  const router = useRouter();
  const { data, setModeration, close, finish } = useSignup();

  const updateCategory = (
    category: 'violence' | 'sexual' | 'hate',
    level: ModerationLevel,
  ) => {
    setModeration({
      ...data.moderation,
      [category]: level,
    });
  };

  return (
    <Screen background={{ gradient: 'surround' }}>
      <Box flexDirection="column" marginHorizontal="lg" height="100%">
        <PageHeader onBack={() => router.back()} onClose={close} />
        <Box flex={1} gap="sm">
          <Text variant="title">Device content moderation</Text>
          <Text variant="body" color="neutralSurface">
            Content moderation only filters what you see on this device if
            you're using the default futo.org server.
          </Text>
          <Text variant="body" color="neutralSurface">
            You will still be able to create posts that violate these settings.
          </Text>
          <Text variant="body" color="neutralSurface">
            Polycentric will never block or censor content.
          </Text>
          <Text variant="body" color="neutralSurface">
            This setting can be changed at any time in your settings.
          </Text>
          <Text variant="body" color="info">
            dev note: Make this more succinct. maybe put some in an info window.
          </Text>
        </Box>
        <Button title="Finish" variant="primary" fullWidth onPress={finish} />
      </Box>
    </Screen>
  );
}

function ModerationCategory({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ModerationLevel;
  onChange: (level: ModerationLevel) => void;
}) {
  return (
    <Box gap="sm">
      <Text variant="body" fontWeight="semibold">
        {label}
      </Text>
      <Box flexDirection="row" gap="sm">
        {([1, 2, 3] as ModerationLevel[]).map((level) => (
          <Button
            key={level}
            title={MODERATION_LABELS[level]}
            variant={value === level ? 'secondary' : 'tertiary'}
            size="sm"
            onPress={() => onChange(level)}
          />
        ))}
      </Box>
    </Box>
  );
}
