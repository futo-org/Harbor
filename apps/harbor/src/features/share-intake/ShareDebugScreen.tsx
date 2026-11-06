import { Button, Screen, Text } from '@/src/common/components';
import { Image } from '@/src/common/components/Image';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import { encodeImageVariants } from '@/src/common/lib/images/processAndUploadImage';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { File } from 'expo-file-system';
import { type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  type PendingShareImage,
  usePendingShareStore,
} from './usePendingShareStore';
import { useShareDebugStore } from './useShareDebugStore';

// Temporary: shows what a share delivered, until shares go to the composer.

const THUMBNAIL_SIZE = 96;

export default function ShareDebugScreen() {
  usePageTitle('Share debug');
  const { theme } = useTheme();
  const pendingShare = usePendingShareStore((state) => state.pendingShare);
  const clearPendingShare = usePendingShareStore(
    (state) => state.clearPendingShare,
  );
  const shareDebugInfo = useShareDebugStore((state) => state.shareDebugInfo);
  const clearShareDebugInfo = useShareDebugStore(
    (state) => state.clearShareDebugInfo,
  );

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_1, theme.atoms.bg]}>
          <Topbar title="Share debug" />
          <ScrollView
            contentContainerStyle={[Atoms.p_lg, Atoms.gap_lg]}
            style={Atoms.flex_1}
          >
            <DebugSection title="Source">
              {shareDebugInfo ? (
                <>
                  <MonospaceText>Source: {shareDebugInfo.source}</MonospaceText>
                  <MonospaceText>
                    Launch: {shareDebugInfo.launch ?? '-'}
                  </MonospaceText>
                  <MonospaceText>
                    Received:{' '}
                    {new Date(shareDebugInfo.receivedAt).toLocaleTimeString()}
                  </MonospaceText>
                </>
              ) : (
                <MonospaceText>No share received</MonospaceText>
              )}
            </DebugSection>

            <DebugSection title="Raw payloads">
              <MonospaceText>
                {JSON.stringify(shareDebugInfo?.rawPayloads ?? [], null, 2)}
              </MonospaceText>
            </DebugSection>

            <DebugSection title="Pending share">
              {pendingShare ? (
                <>
                  <MonospaceText>
                    Text ({pendingShare.text.length} chars):
                  </MonospaceText>
                  <MonospaceText>{pendingShare.text || '-'}</MonospaceText>
                  <MonospaceText>
                    Images: {pendingShare.images.length}
                  </MonospaceText>
                  {pendingShare.images.map((image) => (
                    <PendingImageDetails key={image.uri} image={image} />
                  ))}
                </>
              ) : (
                <MonospaceText>Empty</MonospaceText>
              )}
            </DebugSection>

            <DebugSection title="Images that failed to import">
              <MonospaceText>
                {JSON.stringify(shareDebugInfo?.failedImages ?? [], null, 2)}
              </MonospaceText>
            </DebugSection>

            <Button
              title="Clear"
              variant="secondary"
              disabled={!pendingShare && !shareDebugInfo}
              onPress={() => {
                clearPendingShare();
                clearShareDebugInfo();
              }}
            />
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}

function DebugSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={Atoms.gap_xs}>
      <Text variant="subtitle">{title}</Text>
      {children}
    </View>
  );
}

function MonospaceText({ children }: { children: ReactNode }) {
  return (
    <Text monospace fontSize={12} selectable>
      {children}
    </Text>
  );
}

/** Thumbnail, file details, and whether the image encodes as a post image. */
function PendingImageDetails({ image }: { image: PendingShareImage }) {
  const encodeResult = useEncodeResult(image.uri);
  // Shared images only come from native shares, which copy them to a file
  const file = isWeb ? null : new File(image.uri);

  return (
    <View style={[Atoms.flex_row, Atoms.gap_md, { paddingTop: Spacing.sm }]}>
      <Image
        uris={[image.uri]}
        style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }}
        contentFit="contain"
      />
      <View style={[Atoms.flex_1, Atoms.gap_xs]}>
        <MonospaceText>{image.uri}</MonospaceText>
        <MonospaceText>
          MIME: {file?.type ?? '-'}, size: {file?.size ?? '-'} bytes
        </MonospaceText>
        <MonospaceText>
          Decoded at: {image.width}x{image.height}
        </MonospaceText>
        <MonospaceText>Encode: {encodeResult}</MonospaceText>
      </View>
    </View>
  );
}

/** Run the post image encoding on `uri`, without uploading anything. */
function useEncodeResult(uri: string): string {
  const [encodeResult, setEncodeResult] = useState('running...');

  useEffect(() => {
    let isCancelled = false;
    // The composer's POST_IMAGE_OPTIONS
    encodeImageVariants(uri, { mode: 'fit', sizes: [512, 1280] }).then(
      (variants) => {
        if (isCancelled) return;
        setEncodeResult(
          `ok, ${variants
            .map(
              ({ meta, bytes }) =>
                `${meta.width}x${meta.height} (${bytes.length} bytes)`,
            )
            .join(', ')}`,
        );
      },
      (error: unknown) => {
        if (isCancelled) return;
        const cause = error instanceof Error ? error.cause : undefined;
        setEncodeResult(
          `failed: ${String(error)}${cause === undefined ? '' : ` (${String(cause)})`}`,
        );
      },
    );
    return () => {
      isCancelled = true;
    };
  }, [uri]);

  return encodeResult;
}
