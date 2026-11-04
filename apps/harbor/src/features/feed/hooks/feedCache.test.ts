import type { PostData, PostLabel } from '@/src/common/lib/polycentric-hooks';
import { QueryData, v2 } from '@polycentric/react-native';

jest.mock('@polycentric/react-native', () =>
  jest.requireActual('@/test/polycentric'),
);

// The store only reads the query store from its overlay mutators, which this
// test doesn't exercise.
jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQueryStore: { getState: () => ({ queries: new Map() }) },
  isUnderQueryKey: (key: string, prefix: string) =>
    key === prefix || key.startsWith(`${prefix}\0`),
}));

import { useFeedDataStore } from './feedCache';

const KEY = ['feed', 'following', 'me'].join('\0');
const MODERATOR = 'moderatoridentity';
const OTHER_MODERATOR = 'othermoderatoridentity';

function label(value: string, labeledBy = MODERATOR): PostLabel {
  return { value, labeledBy };
}

/** One post, freshly built each decode, carrying `labels`. */
function decodeWith(labels: PostLabel[]) {
  return (): [PostData[], v2.PageInfo | undefined] => [
    [
      {
        id: 'abcd',
        identity: 'authoridentity',
        signedBy: {} as v2.PublicKey,
        sequence: '5',
        content: 'hello',
        createdAt: 1,
        images: [],
        links: [],
        replyCount: 2,
        signedEvent: {} as v2.SignedEvent,
        labels,
      } as PostData,
    ],
    undefined,
  ];
}

/** A distinct query result; the decode stub ignores its contents. */
function feedData(): QueryData {
  return new QueryData.Feed({
    response: v2.GetFeedResponse.create({}),
    labels: [],
  });
}

/** Model the `PostData` received from a server response */
function emit(queryData: QueryData, labels: PostLabel[]): PostData[] {
  const store = useFeedDataStore.getState();
  const output =
    store.getFeedEntry(KEY, queryData, decodeWith(labels))?.output ?? [];
  useFeedDataStore.getState().pullCachedFeed(KEY, queryData);
  return output;
}

beforeEach(() => {
  useFeedDataStore.setState({ feedData: new Map() });
});

describe('feed cache label handling', () => {
  it('grows a post label set across server responses', () => {
    // Server A responded; the merged response holds only its label.
    const first = emit(feedData(), [label('self-harm')]);
    expect(first[0].labels).toEqual([label('self-harm')]);

    // Server B responded; rs-core merged both sets into the next emission.
    const second = emit(feedData(), [
      label('self-harm'),
      label('spam', OTHER_MODERATOR),
    ]);
    expect(second[0].labels).toEqual([
      label('self-harm'),
      label('spam', OTHER_MODERATOR),
    ]);
  });

  it('drops a label the merged response no longer carries', () => {
    emit(feedData(), [label('self-harm'), label('spam')]);
    const next = emit(feedData(), [label('self-harm')]);
    expect(next[0].labels).toEqual([label('self-harm')]);
  });

  it('keeps post references stable when the label set is unchanged', () => {
    const first = emit(feedData(), [label('self-harm')]);
    const second = emit(feedData(), [label('self-harm')]);
    expect(second[0]).toBe(first[0]);
  });
});
