import { Screen } from '@/src/common/components/layout';
import { openCompose } from '@/src/common/constants';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { isWeb } from '@/src/common/util/platform';
import { ComposerInput, ComposeSheet } from '@/src/features/composer';
import FeedList from '@/src/features/feed/FeedList';
import { useAttributionFeed } from '@/src/features/feed/hooks/useAttributionFeed';
import { AnywhereUrlContext } from '@/src/features/post/content/PostSubheader';
import { useState } from 'react';
import { AnywhereCard } from './AnywhereCard';
import { AnywhereUrlBar } from './AnywhereUrlBar';
import { useAnywhereCommentCount } from './hooks/useAnywhereCommentCount';
import { useAnywhereLink } from './hooks/useAnywhereLink';
import { useAnywhereUrl } from './hooks/useAnywhereUrl';

/** A web page and the posts about it, as "Commented on" links open it. */
export default function AnywhereUrlScreen() {
  const url = useAnywhereUrl();
  const feed = useAttributionFeed(url);
  // As its commenters saw it, before the server's view.
  const { link, loading } = useAnywhereLink(url, feed.items[0]?.attributedLink);
  const commentCount = useAnywhereCommentCount(
    url,
    feed.isLoading ? undefined : feed.items.length,
  );
  const [composing, setComposing] = useState<{ attachImage?: boolean }>();
  const title = link?.title ? `Comments on ${link.title}` : 'Comments';
  usePageTitle(title);

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <AnywhereUrlBar url={url} />
        {link ? (
          <AnywhereUrlContext.Provider value={link.url}>
            <FeedList
              feed={feed}
              emptyMessage="No posts about this page yet"
              ListHeaderComponent={
                <>
                  <AnywhereCard
                    link={link}
                    loading={loading}
                    commentCount={commentCount}
                  />
                  <ComposerInput
                    onCompose={(options) =>
                      isWeb
                        ? setComposing(options)
                        : openCompose({ ...options, attributedTo: link.url })
                    }
                  />
                </>
              }
            />
          </AnywhereUrlContext.Provider>
        ) : (
          <ListEmpty>Page not found</ListEmpty>
        )}
        {composing ? (
          <ComposeSheet
            attributedTo={link}
            attachOnMount={composing.attachImage}
            onPostCreated={() => {}}
            onClose={() => setComposing(undefined)}
          />
        ) : null}
      </Screen.PrimaryColumn>
    </Screen>
  );
}
