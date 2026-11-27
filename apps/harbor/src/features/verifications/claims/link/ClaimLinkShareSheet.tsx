import { Button, CopyButton, Text } from '@/src/common/components';
import { Sheet } from '@/src/common/components/sheet';
import { Atoms, useTheme } from '@/src/common/theme';
import { canShareUrl, nativeShareUrl } from '@/src/common/util/nativeShareUrl';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const QR_CARD_WIDTH = 300;
const QR_CODE_PADDING = 25;

type ClaimLinkShareSheetProps = {
  open: boolean;
  onClose: () => void;
  link: string;
  title: string;
  /** What the claim is about. Shown under the code */
  caption: string;
  hint?: string;
  /** Button that starts the claim here */
  start?: { title: string; onPress: () => void };
};

/** QR code and link that open a prefilled claim form */
export function ClaimLinkShareSheet({
  open,
  onClose,
  link,
  title,
  caption,
  hint,
  start,
}: ClaimLinkShareSheetProps) {
  const { theme } = useTheme();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={['auto']}
      scrollable={false}
      header={<Sheet.Header title={title} onClose={onClose} />}
    >
      <Sheet.Content
        scrollable={false}
        style={[Atoms.items_center, Atoms.gap_lg]}
      >
        <View
          style={[
            Atoms.rounded_lg,
            Atoms.items_center,
            // White in both themes: the QR code needs a light background
            { backgroundColor: theme.colors.light },
            theme.atoms.shadow.neutral,
            {
              width: QR_CARD_WIDTH,
              padding: QR_CODE_PADDING,
              gap: QR_CODE_PADDING,
            },
          ]}
        >
          <QRCode
            testID="claim-link-qr"
            value={link}
            size={QR_CARD_WIDTH - QR_CODE_PADDING * 2}
            backgroundColor="transparent"
          />
          <Text
            variant="title"
            fontWeight="bold"
            color="dark"
            numberOfLines={2}
            style={Atoms.text_center}
          >
            {caption}
          </Text>
        </View>

        {hint ? (
          <Text variant="secondary" color="muted" style={Atoms.text_center}>
            {hint}
          </Text>
        ) : null}

        <View
          style={[
            Atoms.flex_row,
            Atoms.gap_sm,
            // A lone Copy button would be too wide at full width.
            canShareUrl ? Atoms.w_full : { width: QR_CARD_WIDTH },
          ]}
        >
          <View style={Atoms.flex_1}>
            <CopyButton title="Copy Link" value={link} />
          </View>
          {canShareUrl ? (
            <View style={Atoms.flex_1}>
              <Button
                title="Share Link"
                icon="share"
                variant="secondary"
                size="md"
                fullWidth
                onPress={() => nativeShareUrl(link)}
              />
            </View>
          ) : null}
        </View>

        {start ? (
          <View style={canShareUrl ? Atoms.w_full : { width: QR_CARD_WIDTH }}>
            <Button
              title={start.title}
              icon="verify"
              variant="primary"
              size="md"
              fullWidth
              testID="claim-link-start"
              onPress={start.onPress}
            />
          </View>
        ) : null}
      </Sheet.Content>
    </Sheet>
  );
}
