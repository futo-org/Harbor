import Icon from '@/src/common/components/Icon';
import { Text } from '@/src/common/components/primitives';
import { CopyOnlyText } from '@/src/common/components/primitives/CopyOnlyText';
import { Routes } from '@/src/common/constants/routes';
import { NOOP_SYNC } from '@/src/features/feed/hooks/types';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  typography,
  useTheme,
  withHexOpacity,
  ZIndex,
} from '@/src/common/theme';
import {
  parseTextLinks,
  truncateSegments,
  type TextSegment,
} from '@/src/common/util/parseTextLinks';
import { isWeb, isAndroid } from '@/src/common/util/platform';
import { type Href, Link } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

const PREVIEW_LIMIT = 240;
const MAX_DISPLAY_LIMIT = 2000;

type PostTextSize = { fontSize?: 'lg'; lineHeight?: 'lg' };
type LinkSegment = Exclude<TextSegment, { type: 'text' }>;
type MentionTextSegment = Extract<TextSegment, { type: 'alias' | 'identity' }>;

// Distance from a line's top to its text baseline (NotoSans, per text size):
// native inline views sit on the baseline, so the box is lifted by this much.
const MENTION_BASELINE_OFFSET = {
  regular: isAndroid ? 16 : 17,
  large: isAndroid ? 19 : 20,
};

// How far the box's background is inset from the line's top and bottom, so
// boxes on adjacent lines don't touch.
const MENTION_BACKGROUND_INSET = {
  regular: { top: 2, bottom: 1 },
  large: { top: 3, bottom: isWeb ? 3 : 1 },
};

// The person glyph sits off the text's visual center (below it on web, above
// it on native), so it's nudged by this much; positive moves it down.
const MENTION_ICON_SHIFT = isWeb ? 0 : 1;

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

  // The text as read by screen readers, once, without the inline views
  // (emoji images, mention boxes) that also carry it. The selectable
  // UITextView has no label of its own, so it would otherwise be skipped.
  const accessibilityLabel = useMemo(
    () =>
      segments.map((segment) => segment.value).join('') +
      (truncated ? '…' : ''),
    [segments, truncated],
  );

  return (
    <>
      <Text
        variant="secondary"
        selectable={selectable}
        accessibilityLabel={accessibilityLabel}
        {...size}
      >
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
      name="personCircle"
      size={large ? 14 : 12}
      color="primary_500"
      style={[Atoms.mr_2xs, styles.mentionIcon]}
    />
  );

  if (isWeb) {
    return (
      <Link
        className="underlineOnHover"
        href={href}
        style={[
          Atoms.px_2xs,
          Atoms.relative,
          styles.webMentionLink,
          { color: theme.palette.primary_500 },
        ]}
        onPress={stopPostCardPress}
      >
        <MentionBackground large={large} />
        {icon}
        {segment.value}
      </Link>
    );
  }

  return (
    <>
      <View style={styles.nativeMentionAnchor}>
        <Link href={href} asChild onPress={stopPostCardPress}>
          <Pressable
            style={StyleSheet.flatten([
              Atoms.px_2xs,
              Atoms.flex_row,
              Atoms.align_center,
              {
                // Explicit, since the zero-height parent would squash the text.
                height: typography.lineHeight[large ? 'lg' : 'md'],
                transform: [
                  {
                    translateY:
                      -MENTION_BASELINE_OFFSET[large ? 'large' : 'regular'],
                  },
                ],
              },
            ])}
            // Without this, releasing a long press still fires onPress and
            // opens the profile.
            onLongPress={NOOP_SYNC}
          >
            {({ pressed }) => (
              <>
                <MentionBackground large={large} pressed={pressed} />
                {icon}
                <Text
                  variant="secondary"
                  color="primary_500"
                  forceRNText
                  {...size}
                >
                  {segment.value}
                </Text>
              </>
            )}
          </Pressable>
        </Link>
      </View>
      <CopyOnlyText>{segment.value}</CopyOnlyText>
    </>
  );
}

function MentionBackground({
  large,
  pressed = false,
}: {
  large: boolean;
  pressed?: boolean;
}) {
  const { theme } = useTheme();

  const inset = MENTION_BACKGROUND_INSET[large ? 'large' : 'regular'];

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        Atoms.rounded_sm,
        styles.mentionBackground,
        {
          top: inset.top,
          bottom: inset.bottom,
          // Translucent so the Android selection highlight, drawn under inline
          // views, shows through.
          backgroundColor: withHexOpacity(
            theme.palette.primary_500,
            theme.scheme === 'dark' ? '25' : '10',
          ),
        },
      ]}
    >
      {pressed ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            Atoms.rounded_sm,
            // uitextview's press highlight on links: black at 25%.
            { backgroundColor: withHexOpacity(theme.palette.black, '40') },
          ]}
        />
      ) : null}
    </View>
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

const styles = StyleSheet.create({
  mentionIcon: { top: MENTION_ICON_SHIFT, left: 1 },
  webMentionLink: {
    display: 'inline-block',
    // Contains the background's negative z-index, so it paints under this
    // box's text but above the post card.
    zIndex: ZIndex.base,
  },
  // Zero height so the box can't stretch the line it sits on.
  nativeMentionAnchor: { height: 0 },
  // On web, positioned elements paint over in-flow text unless sent back.
  mentionBackground: isWeb ? { zIndex: ZIndex.behind } : {},
});
