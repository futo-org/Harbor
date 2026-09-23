import Icon from '@/src/common/components/Icon';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { TextInput } from '@/src/common/components/primitives';
import { Sheet } from '@/src/common/components/sheet';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { SearchField } from '@/src/features/search/SearchField';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  type TextInput as RNTextInput,
  useWindowDimensions,
  View,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categories, getCategory, type EmojiEntry } from './emojiData';
import { searchEmojis } from './emojiSearch';
import { Emoji, EMOJI_IMAGE_SCALE, EmojiLikeButton } from './Emoji';
import useReactions from './useReactions';
import { ALL_CATEGORIES, useEmojiPickerStore } from './useEmojiPickerStore';
import { isWeb } from '@/src/common/util/platform';

/** Grid cells stay close to this width; wider sheets get more columns. */
const TARGET_CELL_WIDTH = 60;
const MIN_COLUMNS = 8;

/** Every pickable emoji, in category order. */
const ALL_EMOJIS = categories.flatMap((c) => c.emojis);

const keyExtractor = (item: EmojiEntry) => item.emoji;

const CATEGORY_RAIL_BORDER_WIDTH = 1;
// Icon glyph size as a fraction of its button; the rail is sized to leave a
// quarter button at each edge so the outer glyphs sit as far from the sheet
// edge as adjacent glyphs sit from each other.
const CATEGORY_ICON_SCALE = 0.5;
const CATEGORY_BUTTON_COUNT = categories.length + 0.5;

/**
 * Emoji picker sheet with a search input, a category rail and a scrollable
 * grid, using `FlashList` over the emoji set from `emojiData`. While a search
 * query is entered the rail is hidden and the grid shows the matches.
 * Mounted once at the root; opened per post via `useEmojiPickerStore`.
 */
export function EmojiPickerSheet() {
  const { theme } = useTheme();
  const client = usePolycentric();
  const post = useEmojiPickerStore((state) => state.post);
  const open = useEmojiPickerStore((state) => state.open);
  const close = useEmojiPickerStore((state) => state.close);
  const selectedEmoji = useReactions((state) =>
    post ? state.reactions.get(post.id)?.emoji : undefined,
  );
  const toggleReaction = useReactions((state) => state.toggleReaction);
  const selectedCategory = useEmojiPickerStore(
    (state) => state.selectedCategory,
  );
  const toggleCategory = useEmojiPickerStore((state) => state.toggleCategory);
  const query = useEmojiPickerStore((state) => state.query);
  const isSearching = query.trim() !== '';
  const listRef = useRef<FlashListRef<EmojiEntry>>(null);

  // Derivied from the sheet width
  const [contentWidth, setContentWidth] = useState(0);

  // The outer glyphs sit as far from the sheet edge as the search input does
  // (its horizontal padding), so the span between the glyphs' outer edges is
  // the input width; scale the column count with it, keeping cells near
  // TARGET_CELL_WIDTH wide rather than stretching a fixed column count.
  const glyphSpanWidth = contentWidth - 2 * Spacing.lg;
  const numColumns = Math.max(
    MIN_COLUMNS,
    Math.floor(glyphSpanWidth / TARGET_CELL_WIDTH),
  );
  // That span is the columns minus the glyph insets of the two outer cells.
  const colWidth = glyphSpanWidth / (numColumns - (1 - EMOJI_IMAGE_SCALE));
  // The grid is centered, so the leftover width splits into the two margins.
  const gridWidth = colWidth * numColumns;
  // The footer overlays the sheet content, so the grid pads for the rail's
  // visible height (square icons plus the top border); the safe-area part of
  // the footer is covered by the inset TrueSheet gives the pinned list.
  const railHeight =
    contentWidth / CATEGORY_BUTTON_COUNT + CATEGORY_RAIL_BORDER_WIDTH;

  const categoryEmojis = useMemo(
    () =>
      selectedCategory === ALL_CATEGORIES
        ? ALL_EMOJIS
        : (getCategory(selectedCategory)?.emojis ?? ALL_EMOJIS),
    [selectedCategory],
  );

  const searchResults = useMemo(() => searchEmojis(query), [query]);

  const shownEmojis = isSearching ? searchResults : categoryEmojis;

  // Like a category switch, a new query starts the grid from the top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on query change
  useEffect(() => {
    listRef.current?.scrollToTop({ animated: false });
  }, [query]);

  const handleCategorySelect = useCallback(
    (key: string) => {
      toggleCategory(key);
      listRef.current?.scrollToTop({ animated: false });
    },
    [toggleCategory],
  );

  const onSelect = useCallback(
    (emoji: string) => {
      close();
      if (post) toggleReaction(client, post, emoji);
    },
    [close, post, toggleReaction, client],
  );

  const renderItem = useCallback(
    ({ item }: { item: EmojiEntry }) => (
      <Emoji
        emoji={item.emoji}
        selected={item.emoji === selectedEmoji}
        onSelect={onSelect}
        highlightColor={theme.palette.neutral_100}
        size={colWidth}
      />
    ),
    [onSelect, colWidth, theme, selectedEmoji],
  );

  return (
    <Sheet
      open={open}
      onClose={close}
      detents={[0.5]}
      maxWidth={400}
      height={800}
      header={<Sheet.Header title="Pick a reaction" onClose={close} />}
      // A footer sits at the sheet's bottom and rises above the keyboard
      // natively, so hiding it while searching does not resize the grid.
      footer={
        <EmojiCategoryRail
          selectedCategory={selectedCategory}
          onSelect={handleCategorySelect}
          hidden={isSearching}
        />
      }
    >
      <Sheet.Content
        scrollable={false}
        style={Atoms.p_0}
        onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
      >
        {contentWidth > 0 && (
          <>
            <EmojiSearchField />

            <View style={[Atoms.flex_1, Atoms.items_center]}>
              <FlashList
                ref={listRef}
                style={{ width: gridWidth }}
                data={shownEmojis}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                numColumns={numColumns}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                // anchoring on the first visible item would fight the
                // scroll-to-top and is anyway unnecessary here
                maintainVisibleContentPosition={{ disabled: true }}
                contentContainerStyle={
                  // on native the footer overlays the list content, so it needs to be padded to match
                  !isWeb && { paddingBottom: isSearching ? 0 : railHeight }
                }
                ListEmptyComponent={
                  isSearching ? <ListEmpty>No emojis found</ListEmpty> : null
                }
              />
            </View>
          </>
        )}
      </Sheet.Content>
    </Sheet>
  );
}

/** Search input with a clear button, writing to the picker store. */
function EmojiSearchField() {
  const inputRef = useRef<RNTextInput>(null);
  const rawQuery = useEmojiPickerStore((state) => state.rawQuery);
  const setRawQuery = useEmojiPickerStore((state) => state.setRawQuery);
  const clearQuery = useEmojiPickerStore((state) => state.clearQuery);

  // The input is uncontrolled, so a query cleared from elsewhere (the sheet
  // closing) has to clear the native text too.
  useEffect(() => {
    if (rawQuery === '') inputRef.current?.clear();
  }, [rawQuery]);

  return (
    <View style={[Atoms.px_lg, Atoms.py_sm]}>
      <SearchField onPress={() => inputRef.current?.focus()}>
        <Icon name="search" size={16} color="neutral_500" />
        <TextInput
          ref={inputRef}
          variant="plain"
          onChangeText={setRawQuery}
          placeholder="Search emojis"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search emojis"
          style={[Atoms.py_0, Atoms.px_0, Atoms.flex_1]}
        />
        {rawQuery.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={clearQuery}
            hitSlop={Spacing.sm}
            style={({ pressed }) => [pressed && { opacity: 0.5 }]}
          >
            <Icon name="close" size={16} color="neutral_500" />
          </Pressable>
        ) : null}
      </SearchField>
    </View>
  );
}

/**
 * Sheet footer with one tappable icon per category; the selected one is
 * underlined. `hidden` collapses it instead of unmounting: on iOS, TrueSheet
 * only wires a footer to its keyboard observer when the sheet presents, so a
 * footer mounted later stays at the screen bottom, behind the keyboard.
 */
function EmojiCategoryRail({
  selectedCategory,
  onSelect,
  hidden,
}: {
  selectedCategory: string;
  onSelect: (key: string) => void;
  hidden: boolean;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  // Measured here: the footer is not inside `Sheet.Content`.
  const { height: windowHeight } = useWindowDimensions();
  const [railWidth, setRailWidth] = useState(0);
  const categoryColWidth = railWidth / CATEGORY_BUTTON_COUNT;

  return (
    <View style={{ paddingBottom: insets.bottom }}>
      {/* Hides grid rows behind the translucent iOS keyboard: paints the sheet
          background from the footer's top edge (the keyboard top) downward. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          theme.atoms.bg,
          { height: windowHeight },
        ]}
      />
      <View
        style={[
          Atoms.flex_row,
          Atoms.justify_center,
          theme.atoms.bg,
          {
            borderTopWidth: CATEGORY_RAIL_BORDER_WIDTH,
            borderColor: theme.palette.neutral_25,
          },
          hidden && Atoms.hidden,
        ]}
        onLayout={(e) => setRailWidth(e.nativeEvent.layout.width)}
      >
        {railWidth > 0 &&
          categories.map((cat) => (
            <EmojiLikeButton
              key={cat.key}
              size={categoryColWidth}
              onPress={() => onSelect(cat.key)}
              highlightColor={theme.palette.neutral_100}
            >
              <Icon
                name={cat.icon}
                size={Math.round(categoryColWidth * CATEGORY_ICON_SCALE)}
                color={
                  cat.key === selectedCategory ? 'primary_500' : 'neutral_500'
                }
              />
            </EmojiLikeButton>
          ))}
      </View>
    </View>
  );
}
