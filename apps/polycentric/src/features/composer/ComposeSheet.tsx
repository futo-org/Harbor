import { Button } from '@/src/common/components/primitives';
import { Sheet } from '@/src/common/components/sheet';
import { type PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { types } from '@polycentric/react-native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { ComposeSheetFooterBar } from './ComposeSheetFooterBar';
import { ComposerFields } from './ComposerFields';
import { useComposer } from './hooks/useComposer';

type ComposeSheetProps = {
  /** TODO: should be v2 `SignedEvent` */
  onPostCreated: (signedEvent: types.SignedEvent) => void | Promise<void>;
  replyTo?: PostData | null;
  quote?: PostData | null;
  /** Open the image picker as soon as the composer mounts. */
  attachOnMount?: boolean;
};

export function ComposeSheet({
  onPostCreated,
  replyTo,
  quote,
  attachOnMount = false,
}: ComposeSheetProps) {
  const { theme } = useTheme();

  // The composer is presented as a route modal; closing pops it.
  const onClose = useCallback(() => {
    if (router.canGoBack()) router.back();
  }, []);

  const composer = useComposer({
    onPostCreated,
    replyTo,
    quote,
    attachOnMount,
    onClose,
  });

  // Focus the field only after the sheet has presented (iOS fix)
  const [autoFocus, setAutoFocus] = useState(false);

  return (
    <Sheet
      detents={[1]}
      scrollable
      onPresented={() => setAutoFocus(true)}
      footer={
        <ComposeSheetFooterBar
          variant={isWeb ? 'web' : 'native'}
          charCount={composer.text.length}
          submitting={composer.submitting}
          canPost={composer.canPost}
          onPost={composer.handlePost}
          onAttachImage={() => void composer.handleAttachImage()}
          onCaptureImage={
            isWeb ? undefined : () => void composer.handleCaptureImage()
          }
          attachDisabled={composer.attachDisabled}
        />
      }
      header={
        <Sheet.Header
          title={composer.title}
          onClose={composer.handleClose}
          right={
            composer.submitting ? (
              <ActivityIndicator
                size="small"
                color={theme.palette.primary_500}
                accessibilityLabel="Posting"
              />
            ) : (
              <Button
                title={'Post'}
                onPress={composer.handlePost}
                variant="primary"
                disabled={!composer.canPost}
                size="sm"
              />
            )
          }
        />
      }
    >
      <Sheet.Content
        style={[
          Atoms.py_lg,
          Atoms.px_lg,
          {
            minHeight: 200,
          },
        ]}
      >
        <ComposerFields
          isReply={composer.isReply}
          replyTo={composer.replyTo}
          quote={composer.quote}
          error={composer.error}
          currentIdentityKey={composer.currentIdentityKey}
          placeholder={composer.placeholder}
          text={composer.text}
          setText={composer.setText}
          attachments={composer.attachments}
          submitting={composer.submitting}
          onRemoveAttachment={composer.handleRemoveAttachment}
          linkPreview={composer.linkPreview}
          linkPreviewLoading={composer.linkPreviewLoading}
          autoFocus={autoFocus}
        />
      </Sheet.Content>
    </Sheet>
  );
}
