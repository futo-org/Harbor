import Icon from '@/src/common/components/Icon';
import { Text } from '@/src/common/components/primitives';
import { CopyOnlyText } from '@/src/common/components/primitives/CopyOnlyText';
import { Routes } from '@/src/common/constants/routes';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  BorderRadius,
  Spacing,
  typography,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import {
  parseTextLinks,
  truncateSegments,
  type TextSegment,
} from '@/src/common/util/parseTextLinks';
import { isWeb } from '@/src/common/util/platform';
import { type Href, Link } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

const PREVIEW_LIMIT = 240;
const MAX_DISPLAY_LIMIT = 2000;

type PostTextSize = { fontSize?: 'lg'; lineHeight?: 'lg' };
type LinkSegment = Exclude<TextSegment, { type: 'text' }>;
type MentionTextSegment = Extract<TextSegment, { type: 'alias' | 'identity' }>;

// Distance from a line's top to its text baseline (NotoSans, per text size):
// native inline views sit on the baseline, so the box is lifted by this much.
const MENTION_BASELINE_OFFSET = { regular: 17, large: 20 };

/**
 * Renders post body text with tappable links and mentions.
 */
export const PostText = memo(function PostText({
  content,
  expandable = false,
  large = false,
  selectable = false,
}: {
  content: string;
  /** Feed rendering: preview-capped with a Show more toggle. */
  expandable?: boolean;
  /** Detail-view sizing for a focused post. */
  large?: boolean;
  selectable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const truncateToPreview = expandable && !expanded;

  const parsedSegments = useMemo(() => parseTextLinks(content), [content]);
  const { segments, truncated } = useMemo(
    () =>
      truncateSegments(
        parsedSegments,
        truncateToPreview ? PREVIEW_LIMIT : MAX_DISPLAY_LIMIT,
      ),
    [parsedSegments, truncateToPreview],
  );

  const size: PostTextSize = large ? { fontSize: 'lg', lineHeight: 'lg' } : {};

  return (
    <>
      <Text variant="secondary" selectable={selectable} {...size}>
        {segments.map((segment) =>
          // Plain text stays a direct string child: the selectable
          // UITextView only turns direct strings into native text.
          segment.type === 'text' ? (
            segment.value
          ) : isMentionSegment(segment) ? (
            <MentionSegment
              key={segment.start}
              segment={segment}
              size={size}
              large={large}
            />
          ) : (
            <Segment key={segment.start} segment={segment} size={size} />
          ),
        )}
        {truncated ? '…' : ''}
      </Text>
      {truncateToPreview && truncated ? (
        <ShowMoreToggle onPress={() => setExpanded(true)} />
      ) : null}
    </>
  );
});

function ShowMoreToggle({ onPress }: { onPress: () => void }) {
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={[Atoms.self_start]}
    >
      <Text
        variant="body"
        color="primary_500"
        style={hovered ? { textDecorationLine: 'underline' } : undefined}
      >
        Show more
      </Text>
    </Pressable>
  );
}

/**
 * A link/hashtag segment as a tappable primary-colored piece. On web
 * it's a real anchor (hover underline, new tab for external links); on native
 * a Link passes its press handling to our Text, so fonts and emoji still apply
 * and it stays a span of selectable text.
 */
function Segment({
  segment,
  size,
}: {
  segment: LinkSegment;
  size: PostTextSize;
}) {
  const { theme } = useTheme();

  const href = buildSegmentHref(segment);

  if (isWeb) {
    return (
      <Link
        className="underlineOnHover"
        href={href}
        target={segment.type === 'link' ? '_blank' : undefined}
        style={{ color: theme.palette.primary_500 }}
        onPress={stopPostCardPress}
      >
        {segment.value}
      </Link>
    );
  }

  return (
    <Link href={href} asChild onPress={stopPostCardPress}>
      <Text
        variant="secondary"
        color="primary_500"
        fontWeight="regular"
        {...size}
      >
        {segment.value}
      </Text>
    </Link>
  );
}

/**
 * A mention as a bordered box whose text sits exactly where the same text
 * would sit inline. On web it's an inline-block anchor sharing the parent's
 * line height, so its baseline matches. On native it's an inline view lifted
 * off the baseline it's pinned to.
 */
function MentionSegment({
  segment,
  size,
  large,
}: {
  segment: MentionTextSegment;
  size: PostTextSize;
  large: boolean;
}) {
  const { theme } = useTheme();

  const href = buildSegmentHref(segment);
  const icon = (
    <Icon
      name="person"
      size={10}
      color="primary_500"
      style={{ marginRight: Spacing['2xs'] }}
    />
  );
  const boxStyle: TextStyle & ViewStyle = {
    // Translucent so the Android selection highlight, drawn under inline views,
    // shows through. Matches primary_25 on white.
    backgroundColor: withHexOpacity(theme.palette.primary_500, '14'),
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing['2xs'],
  };

  if (isWeb) {
    return (
      <Link
        className="underlineOnHover"
        href={href}
        style={[
          boxStyle,
          {
            color: theme.palette.primary_500,
            display: 'inline-block',
          },
        ]}
        onPress={stopPostCardPress}
      >
        {icon}
        {segment.value}
      </Link>
    );
  }

  const baselineOffset = MENTION_BASELINE_OFFSET[large ? 'large' : 'regular'];

  return (
    <>
      {/* Zero height so the box can't stretch the line it sits on. */}
      <View style={{ height: 0 }}>
        <Link href={href} asChild onPress={stopPostCardPress}>
          <Pressable
            // Link's Slot rejects style arrays on its child.
            style={StyleSheet.flatten([
              boxStyle,
              Atoms.flex_row,
              Atoms.align_center,
              {
                // Explicit, since the zero-height parent would squash the text.
                height: typography.lineHeight[large ? 'lg' : 'md'],
                transform: [{ translateY: -baselineOffset }],
              },
            ])}
          >
            {icon}
            <Text variant="secondary" color="primary_500" forceRNText {...size}>
              {segment.value}
            </Text>
          </Pressable>
        </Link>
      </View>
      <CopyOnlyText>{segment.value}</CopyOnlyText>
    </>
  );
}

// Link's onPress runs before it navigates; stopping the event keeps the
// surrounding post card from opening too.
function stopPostCardPress(e: { stopPropagation?: () => void }) {
  e.stopPropagation?.();
}

function isMentionSegment(segment: TextSegment): segment is MentionTextSegment {
  return segment.type === 'alias' || segment.type === 'identity';
}

function buildSegmentHref(segment: LinkSegment): Href {
  switch (segment.type) {
    case 'link':
      return segment.url as Href;
    case 'hashtag':
      return {
        pathname: Routes.tabs.explore.search,
        params: { q: segment.tag },
      };
    case 'alias':
      return Routes.tabs.profile(segment.alias);
    case 'identity':
      return Routes.tabs.profile(segment.identity);
  }
}
