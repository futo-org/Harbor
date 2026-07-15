import { Screen } from '@/src/common/components/layout';
import { Button } from '@/src/common/components/primitives';
import { Sheet } from '@/src/common/components/sheet';
import { Routes } from '@/src/common/constants';
import { Atoms, useTheme } from '@/src/common/theme';
import type { types } from '@polycentric/react-native';
import { router, useNavigation } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ComposeSheetFooterBar } from './ComposeSheetFooterBar';
import { ComposerFields } from './ComposerFields';
import { useComposer } from './hooks/useComposer';

// Full-screen composer for the detached "compose" native tab item (iOS).
export default function ComposeTabScreen() {
  const { theme } = useTheme();

  const navigation = useNavigation();

  const onClose = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.replace(Routes.tabs.feed.index);
    }
  }, [navigation]);

  const handlePostCreated = useCallback(
    async (_signedEvent: types.SignedEvent) => {
      // TODO: decode sequence from the new v2 SignedEvent and navigate to
      // the created post's route.
    },
    [],
  );

  const composer = useComposer({ onPostCreated: handlePostCreated, onClose });

  return (
    <Screen keyboardAvoiding>
      <Screen.PrimaryColumn>
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
        <View style={[Atoms.flex_1, Atoms.px_lg, Atoms.py_lg]}>
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
          />
        </View>
        <ComposeSheetFooterBar
          variant="native"
          charCount={composer.text.length}
          submitting={composer.submitting}
          canPost={composer.canPost}
          onPost={composer.handlePost}
          onAttachImage={() => void composer.handleAttachImage()}
          onCaptureImage={() => void composer.handleCaptureImage()}
          attachDisabled={composer.attachDisabled}
        />
      </Screen.PrimaryColumn>
    </Screen>
  );
}
