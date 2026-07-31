import { Text } from '@/src/common/components/primitives';
import {
  parseTextLinks,
  type TextSegment,
} from '@/src/common/util/parseTextLinks';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Linking } from 'react-native';

/**
 * Render one parsed segment: plain text, a hyperlink (URLs/bare domains,
 * opened in the browser), or a mention — an alias (`@user@domain.com`) or
 * identity (`@<64-hex>`) — that navigates to that profile in-app. The tap is
 * stopped from also triggering the surrounding post-card press.
 */
function renderSegment(segment: TextSegment, key: number) {
  if (segment.type === 'text') {
    return segment.value;
  }

  return (
    <Text
      key={key}
      variant="secondary"
      color="primary_500"
      style={{ fontWeight: 'bold' }}
      onPress={(e) => {
        e.stopPropagation?.();
        if (segment.type === 'link') {
          void Linking.openURL(segment.url).catch(() => {});
        } else {
          router.push({
            pathname: '/[identityId]',
            params: {
              identityId:
                segment.type === 'alias' ? segment.alias : segment.identity,
            },
          });
        }
      }}
    >
      {segment.value}
    </Text>
  );
}

/** Renders post body text with tappable links and mentions. */
export function PostText({
  content,
  suffix,
}: {
  content: string;
  suffix?: string;
}) {
  const segments = useMemo(() => parseTextLinks(content), [content]);

  return (
    <Text variant="secondary">
      {segments.map(renderSegment)}
      {suffix}
    </Text>
  );
}
