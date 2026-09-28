import { EmojiImage } from '@/src/common/components/EmojiImage';

type Props = {
  sequence: string;
  size: number;
};

/** The picker's emoji glyph; Android draws it from sprite pages instead. */
export function EmojiPickerImage({ sequence, size }: Props) {
  return <EmojiImage sequence={sequence} size={size} />;
}
