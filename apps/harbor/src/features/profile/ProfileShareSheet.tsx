import { Button, CopyButton, ProfileAvatar } from '@/src/common/components';
import { Sheet } from '@/src/common/components/sheet';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { canShareUrl, nativeShareUrl } from '@/src/common/util/nativeShareUrl';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { HARBOR_APP_URL, Routes } from '@/src/common/constants';
import { Username } from '@/src/features/profile/Username';

const QR_CARD_WIDTH = 300;
const QR_CODE_PADDING = 25;

type ProfileShareSheetProps = {
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
      header={<Sheet.Header title="Share Profile" onClose={onClose} />}
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
              color="black"
              style={Atoms.text_center}
              noFollowingBadge
            />
          </View>
        </View>

        <View
          style={[
            Atoms.flex_row,
            Atoms.gap_sm,
            // A lone Copy button would be too wide at full width.
            canShareUrl ? Atoms.w_full : { width: QR_CARD_WIDTH },
          ]}
        >
          <View style={Atoms.flex_1}>
            <CopyButton title="Copy Link" value={profileLink} />
          </View>
          {canShareUrl ? (
            <View style={Atoms.flex_1}>
              <ShareLinkButton link={profileLink} />
            </View>
          ) : null}
        </View>
      </Sheet.Content>
    </Sheet>
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
