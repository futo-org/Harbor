import { Text } from '@/src/common/components/primitives';
import { parseTextLinks } from '@/src/common/util/parseTextLinks';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Linking } from 'react-native';

/**
 * Renders post body text with tappable hyperlinks for URLs and bare
 * domains, and in-app links for alias mentions (`@user@domain.com`).
 * URLs open in the browser; alias mentions navigate to that alias's
 * profile. Taps are stopped from also triggering the surrounding
 * post-card press.
 */
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
      {segments.map((segment, i) =>
        segment.type === 'link' ? (
          <Text
            key={i}
            variant="secondary"
            color="primary_500"
            style={{ fontWeight: 'bold' }}
            onPress={(e) => {
              e.stopPropagation?.();
              void Linking.openURL(segment.url).catch(() => {});
            }}
          >
            {segment.value}
          </Text>
        ) : segment.type === 'alias' ? (
          <Text
            key={i}
            variant="secondary"
            color="primary_500"
            style={{ fontWeight: 'bold' }}
            onPress={(e) => {
              e.stopPropagation?.();
              router.push({
                pathname: '/[identityId]',
                params: { identityId: segment.alias },
              });
            }}
          >
            {segment.value}
          </Text>
        ) : (
          segment.value
        ),
      )}
      {suffix}
    </Text>
  );
}
