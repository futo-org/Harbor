import { Link, type LinkProps } from 'expo-router';
import { renderWithTwemoji } from './Text';

/**
 * A link nested in a `Text`, inside a pressable card: an anchor on web.
 * Pressing it doesn't press the card.
 */
export function InlineLink({
  underlineOnHover = true,
  children,
  ...props
}: Omit<LinkProps, 'onPress'> & { underlineOnHover?: boolean }) {
  return (
    <Link
      className={underlineOnHover ? 'underlineOnHover' : undefined}
      {...props}
      // On web, Link's click bubbles to the card.
      onPress={(event) => event.stopPropagation?.()}
    >
      {/* Link renders an RN Text, which on native leaves emoji to the system font. */}
      {renderWithTwemoji(children)}
    </Link>
  );
}
