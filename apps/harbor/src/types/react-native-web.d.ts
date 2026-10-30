// Web-only props and styles we use: react-native-web supports them, RN's
// types don't declare them.
import type { ColorValue, MouseEvent } from 'react-native';

declare module 'react-native' {
  interface ViewProps {
    dir?: 'ltr' | 'rtl' | 'auto';
    onMouseDown?: (event: MouseEvent) => void;
  }

  interface PressableProps {
    href?: string;
  }

  interface TextProps {
    onMouseEnter?: (event: MouseEvent) => void;
    onMouseLeave?: (event: MouseEvent) => void;
  }

  interface TextStyle {
    caretColor?: ColorValue;
    wordBreak?: 'normal' | 'break-all' | 'keep-all' | 'break-word';
  }
}
