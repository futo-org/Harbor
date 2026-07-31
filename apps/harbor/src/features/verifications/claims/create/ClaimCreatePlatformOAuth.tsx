import { Button, Text } from '@/src/common/components';
import { useToast } from '@/src/common/components/toast';
import { Atoms, useTheme } from '@/src/common/theme';
import { View } from 'react-native';
import type { ClaimRef } from '../../hooks/useCreateClaim';
import useOAuthVerifyPlatformClaim from '../../hooks/useOAuthVerifyPlatformClaim';
import type { Platform } from '../../utils/platforms';

// Link a platform account by signing in to it (OAuth loop).
export function ClaimCreatePlatformOAuth({
  platform,
  onVerified,
}: {
  platform: Platform;
  onVerified: (ref: ClaimRef) => void;
}) {
  const { theme } = useTheme();
  const toast = useToast();
  const verify = useOAuthVerifyPlatformClaim();

  const onSignIn = async () => {
    try {
      const ref = await verify.submit({ platform });
      onVerified(ref);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={Atoms.gap_md}>
      <Text variant="small" style={theme.atoms.text_neutral_medium}>
        Sign in with your {platform.name} account to prove you own it.
        You&apos;ll be sent to {platform.name} and brought back here once
        you&apos;ve signed in.
      </Text>

      <Button
        title={
          verify.isPending ? 'Verifying…' : `Sign in with ${platform.name}`
        }
        variant="primary"
        disabled={verify.isPending}
        onPress={() => void onSignIn()}
      />
    </View>
  );
}
