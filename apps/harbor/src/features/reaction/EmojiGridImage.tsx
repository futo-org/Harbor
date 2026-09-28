import { EmojiImage } from '@/src/common/components/EmojiImage';

type Props = {
  sequence: string;
  size: number;
};

/** An emoji in the picker sheet's grid; Android draws it from sprite pages. */
export function EmojiGridImage({ sequence, size }: Props) {
  return <EmojiImage sequence={sequence} size={size} />;
}
