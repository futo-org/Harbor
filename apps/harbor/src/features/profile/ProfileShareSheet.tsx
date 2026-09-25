import { Button } from '@/src/common/components';
import { QrCode } from '@/src/common/components/QrCode';
import { Sheet } from '@/src/common/components/sheet';
import { Atoms } from '@/src/common/theme';
import { nativeShareUrl } from '@/src/common/util/nativeShareUrl';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { HARBOR_APP_URL, Routes } from '@/src/common/constants';

const QR_CODE_SIZE = 300;
const COPIED_INDICATOR_DURATION_MS = 2000;

type ProfileShareSheetProps = {
  // Identity being shared.
  identityKey: string;
  open: boolean;
  onClose: () => void;
};

export default function ProfileShareSheet({
  identityKey,
  open,
  onClose,
}: ProfileShareSheetProps) {
  const profileLink = `${HARBOR_APP_URL}${Routes.tabs.profile(identityKey)}`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={['auto']}
      scrollable={false}
      header={<Sheet.Header title="Share Profile" onClose={onClose} />}
    >
      <Sheet.Content
        scrollable={false}
        style={[Atoms.items_center, Atoms.gap_lg]}
      >
        <QrCode
          value={profileLink}
          size={QR_CODE_SIZE}
          variant="harbor-gradient"
        />

        <View style={[Atoms.flex_row, Atoms.w_full, Atoms.gap_sm]}>
          <View style={Atoms.flex_1}>
            <CopyLinkButton link={profileLink} />
          </View>
          <View style={Atoms.flex_1}>
            <ShareLinkButton link={profileLink} />
          </View>
        </View>
      </Sheet.Content>
    </Sheet>
  );
}

function CopyLinkButton({ link }: { link: string }) {
  // Briefly flips the button to a "Copied" state after a copy.
  const [justCopied, setJustCopied] = useState<boolean>(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const copyLink = () => {
    void Clipboard.setStringAsync(link);
    setJustCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setJustCopied(false);
      timeoutRef.current = null;
    }, COPIED_INDICATOR_DURATION_MS);
  };

  return (
    <Button
      title={justCopied ? 'Copied' : 'Copy Link'}
      icon={justCopied ? 'checkmark' : 'copy'}
      variant="primary"
      size="md"
      fullWidth
      onPress={copyLink}
    />
  );
}

function ShareLinkButton({ link }: { link: string }) {
  return (
    <Button
      title="Share Link"
      icon="share"
      variant="secondary"
      size="md"
      fullWidth
      onPress={() => nativeShareUrl(link)}
    />
  );
}
