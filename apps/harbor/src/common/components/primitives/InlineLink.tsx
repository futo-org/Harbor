import { Link, type LinkProps } from 'expo-router';
import { renderWithTwemoji } from './Text';

/**
 * A link nested in a `Text`, inside a pressable card: an anchor on web,
 * underlined on hover. Pressing it doesn't press the card.
 */
export function InlineLink({ children, ...props }: Omit<LinkProps, 'onPress'>) {
  return (
    <Link
      className="underlineOnHover"
      {...props}
      // On web, Link's click bubbles to the card.
      onPress={(event) => event.stopPropagation?.()}
    >
      {/* Link renders an RN Text, which on native leaves emoji to the system font. */}
      {renderWithTwemoji(children)}
    </Link>
  );
}
