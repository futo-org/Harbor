import { Text } from '@/src/common/components';
import {
  type PostData,
  truncateName,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { View } from 'react-native';
import { mentionsToPlainText } from '@/src/common/util/parseTextLinks';

type ComposerPostEmbedProps = {
  intentText?: string;
  post: PostData;
};

export default function ComposerPostEmbed({
  intentText = 'Replying to',
  post,
}: ComposerPostEmbedProps) {
  const authorName = useUsername(post?.identity ?? null);
  const content = mentionsToPlainText(post?.content ?? '');
  const contentPreview = content || (post?.images?.length ? 'Image' : '');

  const { theme } = useTheme();
  return (
    <View
      style={[
        Atoms.p_md,
        Atoms.rounded_md,
        theme.atoms_new.box.secondary.bg,
        theme.atoms_new.box.secondary.border,
        { minHeight: 64, borderBottomWidth: 1, marginBottom: 10 },
      ]}
    >
      <Text variant="small">
        {intentText} {truncateName(authorName, 20)}
      </Text>
      <Text variant="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
        {contentPreview}
      </Text>
    </View>
  );
}
