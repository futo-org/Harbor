import { Atoms, BorderRadius, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import type { ReactNode } from 'react';
import { View } from 'react-native';

type SuggestionListProps = { children: ReactNode };

/** Suggestions under an input. Floats on web, inline on native */
export function SuggestionList({ children }: SuggestionListProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.border,
        Atoms.overflow_hidden,
        Atoms.mt_xs,
        { borderRadius: BorderRadius.md },
        theme.atoms.outline,
        theme.atoms.box.secondary.bg,
        isWeb && { position: 'absolute', top: '100%', left: 0, right: 0 },
      ]}
    >
      {children}
    </View>
  );
}
