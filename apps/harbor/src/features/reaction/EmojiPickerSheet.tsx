import { Text, TextInput } from '@/src/common/components/primitives';
import { Sheet } from '@/src/common/components/sheet';
import { Atoms, useTheme } from '@/src/common/theme';
import { useDebouncedValue } from '@/src/features/search/hooks/useDebouncedValue';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categories, getCategory, type EmojiEntry } from './emojiData';
import { searchEmojis } from './emojiSearch';
import { Emoji } from './Emoji';

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
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebouncedValue(searchQuery);
  const isSearching = debouncedQuery.trim() !== '';

  // Derivied from the sheet width
  const [gridWidth, setGridWidth] = useState(0);

  // Start over from the full grid each time the sheet is reopened.
  useEffect(() => {
    if (open) {
      setSelectedCategory(ALL);
      setSearchQuery('');
    }
  }, [open]);

  // Scale the column count with the sheet width, keeping cells near
  // TARGET_CELL_WIDTH wide rather than stretching a fixed column count.
  const numColumns = Math.max(
    MIN_COLUMNS,
    Math.floor(gridWidth / TARGET_CELL_WIDTH),
  );
  const colWidth = gridWidth / numColumns;
  // The footer overlays the sheet content, so the grid pads for the rail's
  // visible height (square icons plus the top border); the safe-area part of
  // the footer is covered by the inset TrueSheet gives the pinned list.
  const railHeight = gridWidth / categories.length + CATEGORY_RAIL_BORDER_WIDTH;

  const categoryEmojis = useMemo(
    () =>
      selectedCategory === ALL
        ? ALL_EMOJIS
        : (getCategory(selectedCategory)?.emojis ?? ALL_EMOJIS),
    [selectedCategory],
  );

  const searchResults = useMemo(
    () => searchEmojis(debouncedQuery),
    [debouncedQuery],
  );

  const shownEmojis = isSearching ? searchResults : categoryEmojis;

  // Like a category switch, a new query starts the grid from the top.
  const handleQueryChange = useCallback((text: string) => {
    setSearchQuery(text);
    listRef.current?.scrollToTop({ animated: false });
  }, []);

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
        onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
      >
        {gridWidth > 0 && (
          <>
            <View style={[Atoms.px_lg, Atoms.py_sm]}>
              <TextInput
                value={searchQuery}
                onChangeText={handleQueryChange}
                placeholder="Search emojis"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Search emojis"
              />
            </View>

            <View style={Atoms.flex_1}>
              <FlashList
                ref={listRef}
                data={shownEmojis}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                numColumns={numColumns}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                // anchoring on the first visible item would fight the
                // scroll-to-top and is anyway unnecesaary here
                maintainVisibleContentPosition={{ disabled: true }}
                contentContainerStyle={{
                  paddingBottom: isSearching ? 0 : railHeight,
                }}
                ListEmptyComponent={isSearching ? NoEmojisFound : null}
              />
            </View>
          </>
        )}
      </Sheet.Content>
    </Sheet>
  );
}

function NoEmojisFound() {
  return (
    <Text
      variant="small"
      color="neutral_500"
      style={[Atoms.p_md, Atoms.text_center]}
    >
      No emojis found
    </Text>
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
  const categoryColWidth = railWidth / categories.length;

  return (
    <View style={{ paddingBottom: insets.bottom }}>
      {/* Hides grid rows behind the translucent iOS keyboard: paints the sheet
          background from the footer's top edge (the keyboard top) downward. */}
      <View
        pointerEvents="none"
        style={[
          Atoms.absolute,
          {
            top: 0,
            left: 0,
            right: 0,
            height: windowHeight,
            backgroundColor: theme.palette.neutral_0,
          },
        ]}
      />
      <View
        style={[
          Atoms.flex_row,
          {
            borderTopWidth: CATEGORY_RAIL_BORDER_WIDTH,
            borderColor: theme.palette.neutral_25,
            backgroundColor: theme.palette.neutral_0,
          },
          hidden && { display: 'none' },
        ]}
        onLayout={(e) => setRailWidth(e.nativeEvent.layout.width)}
      >
        {railWidth > 0 &&
          categories.map((cat) => (
            <Emoji
              key={cat.key}
              emoji={cat.icon}
              value={cat.key}
              size={categoryColWidth}
              onSelect={onSelect}
              highlightColor={theme.palette.neutral_100}
              style={
                cat.key === selectedCategory && {
                  borderBottomWidth: 2,
                  borderBottomColor: theme.palette.primary_500,
                }
              }
            />
          ))}
      </View>
    </View>
  );
}
