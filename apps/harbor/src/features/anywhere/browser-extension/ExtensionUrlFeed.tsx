import { Atoms, useTheme, ZIndex } from '@/src/common/theme';
import { ComposerInput, ComposeSheet } from '@/src/features/composer';
import FeedList from '@/src/features/feed/FeedList';
import { useAttributionFeed } from '@/src/features/feed/hooks/useAttributionFeed';
import type { v2 } from '@polycentric/react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { AnywhereCard } from '../AnywhereCard';
import { useAnywhereCommentCount } from '../hooks/useAnywhereCommentCount';
import { useAnywhereLink } from '../hooks/useAnywhereLink';

/** Room under the list for the composer fixed to the bottom. */
const COMPOSER_BAR_HEIGHT = 72;

/** The posts about the page in the tab, with a composer when signed in. */
export function ExtensionUrlFeed({
  url,
  known,
  canPost,
}: {
  url: string;
  /** What the tab says of the page, when it is the page itself. */
  known?: Partial<v2.Link>;
  canPost: boolean;
}) {
  const { theme } = useTheme();
  const feed = useAttributionFeed(url);
  // From the tab, or from a post about it when the tab is a Harbor page.
  const { link, loading } = useAnywhereLink(
    url,
    known ?? feed.items[0]?.attributedLink,
  );
  const commentCount = useAnywhereCommentCount(
    url,
    feed.isLoading ? undefined : feed.items.length,
  );
  const [composing, setComposing] = useState<{ attachImage?: boolean }>();

  return (
    <>
      <FeedList
        feed={feed}
        ListHeaderComponent={
          link ? (
            <AnywhereCard
              link={link}
              loading={loading}
              compact
              commentCount={commentCount}
            />
          ) : null
        }
        emptyMessage="No posts about this page yet"
        contentContainerStyle={{ paddingBottom: COMPOSER_BAR_HEIGHT }}
      />
      {composing ? (
        <ComposeSheet
          attributedTo={link}
          attachOnMount={composing.attachImage}
          onPostCreated={() => {}}
          onClose={() => setComposing(undefined)}
        />
      ) : null}
      {canPost ? (
        <View
          style={[
            Atoms.fixed,
            {
              bottom: 0,
              left: 0,
              right: 0,
              borderTopWidth: 1,
              borderTopColor: theme.palette.neutral_25,
              zIndex: ZIndex.raised,
            },
          ]}
        >
          <ComposerInput onCompose={setComposing} />
        </View>
      ) : null}
    </>
  );
}
