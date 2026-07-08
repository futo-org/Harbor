import { Button, Text, TextInput } from '@/src/common/components';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { useState } from 'react';
import { View } from 'react-native';
import { CopyLinkComponent } from '../CopyLinkComponent';
import { isProfileUrl, Platform } from '../utils/platforms';

// Link a platform account by adding a loop-back link to its profile.
export function ClaimCreatePlatformLink({ platform }: { platform: Platform }) {
  const { theme } = useTheme();
  const { identityKey } = useCurrentIdentity();
  const [profileUrl, setProfileUrl] = useState('');

  // Loop-back link the user adds to their profile to prove ownership.
  const loopbackLink = identityKey
    ? `https://polycentric.io/${identityKey}`
    : '';

  return (
    <View style={Atoms.gap_sm}>
      <Text
        variant="small"
        style={theme.atoms.text_neutral_medium}
        fontWeight="semibold"
      >
        {platform.generic ? 'Your website' : `Your ${platform.name} profile`}
      </Text>
      <TextInput
        value={profileUrl}
        onChangeText={setProfileUrl}
        autoFocus
        placeholder={platform.placeholder}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/* Loop-back link the user adds to their profile. */}
      <CopyLinkComponent link={loopbackLink} />
      <Text variant="small" style={theme.atoms.text_neutral_medium}>
        {platform.generic
          ? 'Add this link anywhere on your website.'
          : `Add this link to your ${platform.name} social links or ${platform.location}.`}{' '}
        It may take a few minutes after updating for verification to succeed.
        Removing the link may result in the verification being revoked in the
        future.
      </Text>

      <Button
        title="Verify"
        variant="primary"
        disabled={!isProfileUrl(profileUrl) || !loopbackLink}
        // TODO: start the platform loop-back verification flow.
        onPress={() => {}}
      />
    </View>
  );
}
