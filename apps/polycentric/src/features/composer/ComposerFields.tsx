import Icon from '@/src/common/components/Icon';
import {
  ProfileAvatar,
  Text,
  TextArea,
} from '@/src/common/components/primitives';
import { type PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Image, Pressable, View } from 'react-native';
import ComposerPostEmbed from './ComposerPostEmbed';
import type { useComposer } from './hooks/useComposer';

const THUMBNAIL_SIZE = 72;

type Attachment = ReturnType<typeof useComposer>['attachments'][number];

type ComposerFieldsProps = {
  isReply: boolean;
  replyTo?: PostData | null;
  quote?: PostData | null;
  error: string | null;
  currentIdentityKey: string | null;
  placeholder: string;
  text: string;
  setText: (text: string) => void;
  attachments: Attachment[];
  submitting: boolean;
  onRemoveAttachment: (id: string) => void;
  /** Auto-focus the text field.**/
  autoFocus?: boolean;
};

/**
 * The composer form body (reply/quote previews, error, avatar + text area,
 * attachment thumbnails). Shared by the sheet composer and the full-screen
 * compose tab; each caller supplies its own padded, flex container.
 */
export function ComposerFields({
  isReply,
  replyTo,
  quote,
  error,
  currentIdentityKey,
  placeholder,
  text,
  setText,
  attachments,
  submitting,
  onRemoveAttachment,
  autoFocus = true,
}: ComposerFieldsProps) {
  const { theme } = useTheme();

  return (
    <>
      {/* Reply preview */}
      {isReply && replyTo && <ComposerPostEmbed post={replyTo} />}

      {/* Error displays */}
      {error && (
        <View
          style={[
            Atoms.p_md,
            {
              borderBottomWidth: 1,
              borderBottomColor: withHexOpacity(
                theme.palette.negative_500,
                '80',
              ),
              marginBottom: 10,
            },
          ]}
        >
          <Text variant="secondary" color="negative_500">
            {error}
          </Text>
        </View>
      )}

      {/* Main block */}
      <View style={[Atoms.flex_row, Atoms.gap_md, Atoms.flex_1]}>
        {currentIdentityKey ? (
          <View style={[Atoms.self_start]}>
            <ProfileAvatar identityKey={currentIdentityKey} size="md" />
          </View>
        ) : null}
        <View style={Atoms.flex_1}>
          <TextArea
            // `autoFocus` only fires on mount, so re-key when it flips
            // (false → true after the sheet presents) to actually focus.
            key={autoFocus ? 'autofocus' : 'no-autofocus'}
            variant="plain"
            placeholder={placeholder}
            autoFocus={autoFocus}
            value={text}
            onChangeText={setText}
            // disabled={submitting}
            maxLength={2000}
            style={[
              Atoms.px_0,
              Atoms.py_0,
              Atoms.pt_sm,
              Atoms.text_lg,
              Atoms.flex_1,
            ]}
          />
          {attachments.length > 0 && (
            <View
              style={[
                Atoms.flex_row,
                Atoms.gap_sm,
                { flexWrap: 'wrap', marginTop: 8 },
              ]}
            >
              {attachments.map((a) => (
                <AttachmentThumb
                  key={a.id}
                  uri={a.uri}
                  disabled={submitting}
                  onRemove={() => onRemoveAttachment(a.id)}
                />
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Quote preview */}
      {!!quote && <ComposerPostEmbed post={quote} intentText="Quoting" />}
    </>
  );
}

function AttachmentThumb({
  uri,
  disabled,
  onRemove,
}: {
  uri: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
      }}
    >
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      <Pressable
        onPress={onRemove}
        disabled={disabled}
        accessibilityLabel="Remove attachment"
        hitSlop={6}
        style={{
          position: 'absolute',
          top: 2,
          right: 2,
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withHexOpacity(theme.palette.black, 'b0'),
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <Icon name="close" size={14} color="white" />
      </Pressable>
    </View>
  );
}
