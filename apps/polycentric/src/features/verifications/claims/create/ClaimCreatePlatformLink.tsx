import { Button, Text, TextInput } from '@/src/common/components';
import { useToast } from '@/src/common/components/toast';
import { POLYCENTRIC_APP_URL } from '@/src/common/constants';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { useState } from 'react';
import { View } from 'react-native';
import { CopyLinkComponent } from '../../CopyLinkComponent';
import type { ClaimRef } from '../../hooks/useCreateClaim';
import useVerifyPlatformClaim from '../../hooks/useVerifyPlatformClaim';
import { isProfileUrl, type Platform } from '../../utils/platforms';

// Link a platform account by adding a loop-back link to its profile.
export function ClaimCreatePlatformLink({
  platform,
  onVerified,
}: {
  platform: Platform;
  onVerified: (ref: ClaimRef) => void;
}) {
  const { theme } = useTheme();
  const toast = useToast();
  const { identityKey } = useCurrentIdentity();
  const [profileUrl, setProfileUrl] = useState('');
  const verify = useVerifyPlatformClaim();

  // Loop-back link the user adds to their profile to prove ownership. The
  // verifier checks the profile for the identity key it carries.
  const loopbackLink = identityKey
    ? `${POLYCENTRIC_APP_URL}/${identityKey}`
    : '';

  const onVerify = async () => {
    try {
      const ref = await verify.submit({ platform, profileUrl });
      onVerified(ref);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={Atoms.gap_md}>
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
          : // The verifier only reads the profile's text; a link placed in a
            // platform's structured "social links" section won't be seen.
            `Add this link to your ${platform.name} ${platform.location}.`}{' '}
        It may take a few minutes after updating for verification to succeed.
        Removing the link may result in the verification being revoked in the
        future.
      </Text>

      <Button
        title={verify.isPending ? 'Verifying…' : 'Verify'}
        variant="primary"
        disabled={
          !isProfileUrl(profileUrl) || !loopbackLink || verify.isPending
        }
        onPress={() => void onVerify()}
      />
    </View>
  );
}
