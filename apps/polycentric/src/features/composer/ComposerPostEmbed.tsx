import { Text } from '@/src/common/components';
import {
  PostData,
  truncateName,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { View } from 'react-native';

type ComposerPostEmbedProps = {
  intentText?: string;
  post: PostData;
};

export default function ComposerPostEmbed({
  intentText = 'Replying to',
  post,
}: ComposerPostEmbedProps) {
  const authorName = useUsername(post?.identity ?? null);
  const content = post?.content ?? '';
  const contentPreview =
    content.length > 30 ? `${content.slice(0, 30)}…` : content;

  const { theme } = useTheme();
  return (
    <View
      style={[
        Atoms.p_md,
        Atoms.rounded_md,
        {
          minHeight: 64,
          backgroundColor: withHexOpacity(theme.palette.neutral_500, '10'),
          borderBottomWidth: 1,
          borderBottomColor: withHexOpacity(theme.palette.neutral_500, '20'),
          marginBottom: 10,
        },
      ]}
    >
      <Text variant="small" style={theme.atoms.text_neutral_high}>
        {intentText} {truncateName(authorName, 20)}
      </Text>
      <Text
        variant="secondary"
        numberOfLines={2}
        style={[theme.atoms.text_neutral_high, { marginTop: 2 }]}
      >
        {contentPreview}
      </Text>
    </View>
  );
}
