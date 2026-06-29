import { Button, Text } from '@/src/common/components';
import { Sheet } from '@/src/common/components/sheet';
import { POLYCENTRIC_APP_URL } from '@/src/common/constants/app';
import { Atoms, useTheme } from '@/src/common/theme';
import { Platform, Share } from 'react-native';
import { CopyLinkComponent } from './CopyLinkComponent';

// Native gets the OS share sheet; web only if the browser supports navigator.share.
const canShare =
  Platform.OS !== 'web' || typeof globalThis.navigator?.share === 'function';

export function RequestVerificationSheet({
  open,
  onClose,
  identityId,
  keyFingerprint,
  sequence,
}: {
  open: boolean;
  onClose: () => void;
  identityId: string;
  keyFingerprint: string;
  sequence: string;
}) {
  const { theme } = useTheme();
  const link = `${POLYCENTRIC_APP_URL}/${identityId}/verifications/${keyFingerprint}/${sequence}`;

  const onShare = async () => {
    try {
      if (Platform.OS === 'web') {
        await globalThis.navigator?.share?.({ url: link });
      } else {
        await Share.share({ message: link });
      }
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={[0.5]}
      scrollable
      header={<Sheet.Header title="Request verification" onClose={onClose} />}
    >
      <Sheet.Content style={Atoms.gap_md}>
        <Text variant="body" style={theme.atoms.text_neutral_medium}>
          Share this link to request verification of your claim.
        </Text>

        <CopyLinkComponent link={link} />

        {canShare && (
          <Button
            title="Share"
            variant="secondary"
            icon="share"
            onPress={onShare}
          />
        )}
      </Sheet.Content>
    </Sheet>
  );
}
