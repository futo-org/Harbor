import {
  Button,
  CharCount,
  FormField,
  Screen,
  Text,
} from '@/src/common/components';
import Topbar from '@/src/common/components/layout/Topbar';
import { TextArea } from '@/src/common/components/TextArea';
import { useToast } from '@/src/common/components/toast';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MAX_FEEDBACK_LENGTH,
  buildFeedback,
  sendFeedback,
} from './lib/feedback';
import { getTelemetryIdentity } from './lib/identity';

export default function SendFeedbackScreen() {
  usePageTitle('Send feedback');
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const { identityKey } = useCurrentIdentity();

  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [includeLogs, setIncludeLogs] = useState(true);
  const [sending, setSending] = useState(false);

  const canSend = message.trim().length > 0 && !sending;

  const onSubmit = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const feedback = buildFeedback({
        message,
        email,
        identityKey,
        signingKey: getTelemetryIdentity().signingKey,
        includeLogs,
      });
      if (await sendFeedback(feedback)) {
        toast.success('Thanks for your feedback');
        router.back();
      } else {
        toast.error('Could not send feedback. Please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen keyboardAvoiding>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_1, theme.atoms.bg]}>
          <Topbar
            title="Send feedback"
            right={
              <Button
                title={sending ? 'Sending…' : 'Send'}
                variant="primary"
                size="sm"
                disabled={!canSend}
                onPress={() => void onSubmit()}
                testID="feedback-submit"
              />
            }
          />
          <ScrollView
            style={Atoms.flex_1}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              Atoms.p_lg,
              Atoms.gap_lg,
              { paddingBottom: insets.bottom + Spacing['2xl'] },
            ]}
          >
            <View style={Atoms.gap_xs}>
              <TextArea
                value={message}
                onChangeText={setMessage}
                placeholder="What went wrong, or what would you like to see improved?"
                maxLength={MAX_FEEDBACK_LENGTH}
                minHeight={120}
                autoFocus
                testID="feedback-message"
              />
              <CharCount count={message.length} max={MAX_FEEDBACK_LENGTH} />
            </View>

            <FormField
              label="Email (optional)"
              value={email}
              onChangeText={setEmail}
              placeholder="If you want a reply"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              testID="feedback-email"
            />

            <ToggleRow
              label="Include logs"
              description="Attach recent logs from this device. Review them under Settings → View logs."
              value={includeLogs}
              onValueChange={setIncludeLogs}
              testID="feedback-include-logs"
            />

            <Text variant="small" color="neutral_500" fontWeight="regular">
              App version, device details and your identity are always attached.
            </Text>
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  testID?: string;
}) {
  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.justify_between,
        Atoms.gap_md,
      ]}
    >
      <View style={[Atoms.flex_1, Atoms.gap_xs]}>
        <Text variant="body">{label}</Text>
        <Text variant="small" color="neutral_500" fontWeight="regular">
          {description}
        </Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} testID={testID} />
    </View>
  );
}
