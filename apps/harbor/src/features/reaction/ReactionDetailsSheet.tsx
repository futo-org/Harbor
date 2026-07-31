import { Text } from '@/src/common/components';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { HorizontalScrollGroup } from '@/src/common/components/primitives';
import { Sheet } from '@/src/common/components/sheet';
import { Routes } from '@/src/common/constants';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { FetchMode } from '@polycentric/react-native';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReactionRowSkeletonList } from './ReactionRowSkeleton';
import usePostReactions, {
  type ReactionGroup,
  type ReactionInfo,
} from './usePostReactions';
import { countReactionsFrom, type ReactionCount } from './util';

const MAX_SKELETONS = 6;

type ReactionDetailsSheetProps = {
  post: PostData;
  open: boolean;
  onClose: () => void;
};

/** All of the data for a single tab in the sheet. */
type TabData = {
  /**
   * Indicates that this tab only has reactions with the specified emoji.
   * A `null` value means that this tab is for all reactions.
   */
  emoji: string | null;

  /**
   * Our estimate for how many reactions for this post fit this tab's criteria.
   * It may be greater than the number of reactions we have for this tab,
   * since we have a limit to how many reaction events we fetch.
   */
  countEstimate: number;

  /** Reaction event data to display in this tab. */
  reactions: ReactionInfo[];
};

/**
 * Derive the tab data to display from the reaction tallies and events.
 */
function deriveTabs(
  groups: Map<string, ReactionGroup>,
  all: ReactionInfo[],
  counts: ReactionCount[],
  upvoteCount: number | undefined,
): TabData[] {
  // Begin with just the "all" tab.
  const tabs: TabData[] = [
    {
      emoji: null,
      countEstimate: Math.max(all.length, upvoteCount ?? 0),
      reactions: all,
    },
  ];

  // Create initial tab data from the reaction tallies to order the reactions
  // from most popular to least and then pull in reaction events.
  const seen = new Set<string>();
  for (const tally of counts) {
    seen.add(tally.emoji);

    const reactions = groups.get(tally.emoji)?.reactions ?? [];
    tabs.push({
      emoji: tally.emoji,
      // Ensure we don't display a counter less than the number of events we have:
      countEstimate: Math.max(tally.count, reactions.length),
      reactions,
    });
  }

  // Add tabs for reaction events for which we have no corresponding tally.
  for (const group of groups.values()) {
    if (seen.has(group.emoji)) continue;
    tabs.push({
      emoji: group.emoji,
      countEstimate: group.reactions.length,
      reactions: group.reactions,
    });
  }

  return tabs;
}

/**
 * Tab bar based off of `@/src/common/components/Tabs.tsx`, with a few differences:
 * - horizontally scrollable
 * - tabs are sized based on content
 * - content size doesn't change when a tab is selected
 */
function ReactionTabs({
  tabs,
  selected,
  onSelect,
}: {
  tabs: TabData[];
  selected: TabData;
  onSelect: (emoji: string | null) => void;
}) {
  const { theme } = useTheme();

  return (
    <HorizontalScrollGroup
      style={[
        Atoms.flex_grow_0,
        {
          borderBottomWidth: 1,
          borderBottomColor: theme.palette.neutral_25,
        },
      ]}
      contentContainerStyle={[Atoms.flex_row, Atoms.align_center, Atoms.px_lg]}
    >
      {tabs.map((tab) => {
        const active = tab.emoji === selected.emoji;

        return (
          <Pressable
            key={tab.emoji ?? 'all'}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={
              tab.emoji === null ? 'All reactions' : `${tab.emoji} reactions`
            }
            onPress={() => onSelect(tab.emoji)}
            style={({ hovered, pressed }) => [
              Atoms.cursor_pointer,
              (hovered || pressed) && {
                backgroundColor: theme.palette.neutral_25,
              },
            ]}
          >
            <View
              style={[
                Atoms.flex_row,
                Atoms.align_center,
                Atoms.justify_center,
                Atoms.gap_sm,
                Atoms.p_md,
              ]}
            >
              {tab.emoji === null ? (
                <Text
                  variant="secondary"
                  fontWeight="semibold"
                  color={active ? 'neutral_900' : 'neutral_500'}
                  selectable={false}
                >
                  {tab.countEstimate > 0 ? `All • ${tab.countEstimate}` : 'All'}
                </Text>
              ) : (
                <>
                  <Text style={{ fontSize: 18 }} selectable={false}>
                    {tab.emoji}
                  </Text>
                  <Text
                    variant="secondary"
                    fontWeight="semibold"
                    color={active ? 'neutral_900' : 'neutral_500'}
                    selectable={false}
                  >
                    {tab.countEstimate}
                  </Text>
                </>
              )}
              {active && (
                <View
                  style={[
                    Atoms.absolute,
                    Atoms.self_center,
                    Atoms.w_full,
                    Atoms.rounded_full,
                    {
                      height: 4,
                      bottom: 0,
                      backgroundColor: theme.palette.primary_500,
                    },
                  ]}
                />
              )}
            </View>
          </Pressable>
        );
      })}
    </HorizontalScrollGroup>
  );
}

/**
 * Sheet that lists the reactions for a post.
 */
export default function ReactionDetailsSheet({
  post,
  open,
  onClose,
}: ReactionDetailsSheetProps) {
  const insets = useSafeAreaInsets();
  const { isLoading, groups, all } = usePostReactions(open ? post : undefined);

  const reactionCounts = useMemo(() => countReactionsFrom(post), [post]);

  const tabData = useMemo(
    () => deriveTabs(groups, all, reactionCounts, post.upvoteCount),
    [groups, all, reactionCounts, post.upvoteCount],
  );

  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);

  // Always open to the "all" tab.
  useEffect(() => {
    if (open) setSelectedEmoji(null);
  }, [open]);

  // Fall back to the "all" tab if the selected tab was removed.
  const selected =
    tabData.find((tab) => tab.emoji === selectedEmoji) ?? tabData[0];

  // Show skeletons for the active tab if the query is still loading and we have
  // less reactions than estimated.
  // This case is very common since the user's own reaction will always be
  // included, and we don't want to have the other reactions jump in later
  // with no loading indicator.
  const skeletonCount = isLoading
    ? Math.min(
        Math.max(selected.countEstimate - selected.reactions.length, 0),
        MAX_SKELETONS,
      )
    : 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={[0.5, 0.9]}
      scrollable={true}
      header={<Sheet.Header title="Reactions" onClose={onClose} />}
    >
      <Sheet.Content style={{ padding: 0 }}>
        <ReactionTabs
          tabs={tabData}
          selected={selected}
          onSelect={setSelectedEmoji}
        />
        <ScrollView
          // Prevent the modal size from changing when switching tabs on web:
          style={isWeb ? { height: 'clamp(360px, 60vh, 560px)' } : Atoms.flex_1}
          contentContainerStyle={[
            Atoms.flex_grow_1,
            { paddingBottom: insets.bottom + Spacing.lg },
          ]}
        >
          {selected.reactions.length === 0 && skeletonCount === 0 ? (
            <ListEmpty>No reactions to show</ListEmpty>
          ) : (
            <>
              {selected.reactions.map((reaction) => (
                <ProfileRow
                  key={`${reaction.identity}-${reaction.emoji}`}
                  identity={reaction.identity}
                  fetchMode={FetchMode.OfflineFirst}
                  onPress={() => {
                    onClose();
                    router.push(Routes.tabs.profile(reaction.identity));
                  }}
                  trailing={
                    <Text style={{ fontSize: 18 }}>{reaction.emoji}</Text>
                  }
                />
              ))}
              {skeletonCount > 0 && (
                <ReactionRowSkeletonList count={skeletonCount} />
              )}
            </>
          )}
        </ScrollView>
      </Sheet.Content>
    </Sheet>
  );
}
