import Icon from '@/src/common/components/Icon';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { TextInput } from '@/src/common/components/primitives';
import { Sheet } from '@/src/common/components/sheet';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { useDebouncedValue } from '@/src/features/search/hooks/useDebouncedValue';
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

type EmojiPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  selectedEmoji?: string | null;
};

/** Sentinel category key for the unfiltered grid. */
const ALL = 'All';

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
 */
export function EmojiPickerSheet({
  open,
  onClose,
  onSelect,
  selectedEmoji,
}: EmojiPickerSheetProps) {
  const { theme } = useTheme();
  const listRef = useRef<FlashListRef<EmojiEntry>>(null);
  const searchInputRef = useRef<RNTextInput>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL);
  const [rawQuery, setRawQuery] = useState('');
  const query = useDebouncedValue(
    rawQuery,
    // Empty query resets the search immediately
    rawQuery ? 300 : 0,
  );
  const isSearching = query.trim() !== '';

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
      selectedCategory === ALL
        ? ALL_EMOJIS
        : (getCategory(selectedCategory)?.emojis ?? ALL_EMOJIS),
    [selectedCategory],
  );

  const searchResults = useMemo(() => searchEmojis(query), [query]);

  const shownEmojis = isSearching ? searchResults : categoryEmojis;

  // Like a category switch, a new query starts the grid from the top.
  const handleQueryChange = useCallback((text: string) => {
    setRawQuery(text);
    listRef.current?.scrollToTop({ animated: false });
  }, []);

  const clearQuery = useCallback(() => {
    // The input is uncontrolled, so its native text is cleared separately
    searchInputRef.current?.clear();
    handleQueryChange('');
  }, [handleQueryChange]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setSelectedCategory(ALL);
      clearQuery();
    }
  }, [open, clearQuery]);

  const handleCategorySelect = useCallback((key: string) => {
    setSelectedCategory((prev) => (prev === key ? ALL : key));
    listRef.current?.scrollToTop();
  }, []);

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
      onClose={onClose}
      detents={[0.5]}
      maxWidth={400}
      header={<Sheet.Header title="Pick a reaction" onClose={onClose} />}
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
            <View style={[Atoms.px_lg, Atoms.py_sm]}>
              <SearchField onPress={() => searchInputRef.current?.focus()}>
                <Icon name="search" size={16} color="neutral_500" />
                <TextInput
                  ref={searchInputRef}
                  variant="plain"
                  onChangeText={handleQueryChange}
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
                contentContainerStyle={{
                  paddingBottom: isSearching ? 0 : railHeight,
                }}
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
