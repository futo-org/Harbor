import { Text } from '@/src/common/components/primitives/Text';
import { Atoms, useTheme } from '@/src/common/theme';
import type { ReactNode } from 'react';
import { View } from 'react-native';

// Links collapse to their label; **bold** becomes semibold.
function renderInline(text: string): ReactNode {
  const delinked = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  return delinked.split(/(\*\*[^*]+\*\*)/g).map((segment, index) => {
    const bold = segment.match(/^\*\*([^*]+)\*\*$/);
    const key = `${index}-${segment}`;
    return bold ? (
      <Text key={key} fontWeight="semibold">
        {bold[1]}
      </Text>
    ) : (
      <Text key={key}>{segment}</Text>
    );
  });
}

/** Just enough markdown for the GitLab changelog output: `###` headings,
 *  `-` bullets, links, and bold. */
export function ReleaseNotes({ notes }: { notes: string }) {
  const { theme } = useTheme();

  const lines = notes.split('\n');

  return (
    <View style={Atoms.gap_sm}>
      {lines.map((line, index) => {
        const key = `${index}-${line}`;
        const trimmed = line.trim();
        if (!trimmed) return null;

        const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
        if (heading) {
          return (
            <Text
              key={key}
              variant="body"
              fontWeight="semibold"
              style={index > 0 && Atoms.mt_sm}
            >
              {renderInline(heading[1])}
            </Text>
          );
        }

        const bullet = trimmed.match(/^[-*]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={key} style={[Atoms.flex_row, Atoms.gap_sm, Atoms.pl_xs]}>
              <Text variant="secondary" style={theme.atoms.text_neutral_medium}>
                {'•'}
              </Text>
              <Text
                variant="secondary"
                style={[Atoms.flex_1, theme.atoms.text_neutral_medium]}
              >
                {renderInline(bullet[1])}
              </Text>
            </View>
          );
        }

        return (
          <Text
            key={key}
            variant="secondary"
            style={theme.atoms.text_neutral_medium}
          >
            {renderInline(trimmed)}
          </Text>
        );
      })}
    </View>
  );
}
