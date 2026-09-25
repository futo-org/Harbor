import { Button, ProfileAvatar } from '@/src/common/components';
import { Sheet } from '@/src/common/components/sheet';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { nativeShareUrl } from '@/src/common/util/nativeShareUrl';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { HARBOR_APP_URL, Routes } from '@/src/common/constants';
import { Username } from '@/src/features/profile/Username';

const QR_CARD_WIDTH = 300;
const QR_CODE_PADDING = 25;
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
  const { theme } = useTheme();
  const profileLink = `${HARBOR_APP_URL}${Routes.tabs.profile(identityKey)}`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={['auto']}
      scrollable={false}
      header={<View style={{ height: QR_CODE_PADDING }} />}
    >
      <Sheet.Content
        scrollable={false}
        style={[Atoms.items_center, Atoms.gap_2xl]}
      >
        <View
          style={[
            Atoms.rounded_lg,
            {
              backgroundColor: theme.palette.white,
              boxShadow: `0 12px 40px ${withHexOpacity(theme.palette.black, '1F')}`,
              width: QR_CARD_WIDTH,
              padding: QR_CODE_PADDING,
              gap: QR_CODE_PADDING,
            },
          ]}
        >
          <View>
            <View style={[Atoms.rounded_sm, Atoms.overflow_hidden]}>
              <QRCode
                value={profileLink}
                size={QR_CARD_WIDTH - QR_CODE_PADDING * 2}
                backgroundColor="transparent"
                enableLinearGradient
                gradientDirection={['0%', '0%', '0%', '100%']}
                linearGradient={[
                  theme.palette.primary_100,
                  theme.palette.primary_500,
                ]}
              />
            </View>
            <View
              style={[
                StyleSheet.absoluteFill,
                Atoms.items_center,
                Atoms.justify_center,
              ]}
            >
              <View
                style={[
                  Atoms.p_xs,
                  Atoms.rounded_full,
                  { backgroundColor: theme.palette.white },
                ]}
              >
                <ProfileAvatar identityKey={identityKey} size="lg" />
              </View>
            </View>
          </View>

          <View style={[Atoms.items_center]}>
            <Username
              identity={identityKey}
              variant="title"
              fontWeight="bold"
              numberOfLines={2}
              color="primary_500"
              style={Atoms.text_center}
              noFollowingBadge
            />
          </View>
        </View>

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
