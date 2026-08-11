import type { ComponentProps } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Harbor's own SVG icon family. Every glyph is drawn on the same 24×24
 * square viewBox with a 2px stroke, sized so the stroke ink reaches the
 * viewBox edges — unlike the vector-icon fonts, whose glyphs carry
 * different built-in padding per family.
 */
type GlyphPart =
  | { d: string; filled?: boolean }
  | { cx: number; cy: number; r: number };
type Glyph = GlyphPart[];

const GLYPHS = {
  quote: [
    { d: 'M12 21.9h11' },
    {
      d: 'M17.5 1.8a2.6 2.6 0 0 1 3.7 3.7L5.9 20.7l-3.4.8q-1.7.5-1.1-1.1l.8-3.4z',
    },
  ],
  reaction: [
    {
      d: 'M12 5.3C13 3.5 15 2.3 17 2.3C20.5 2.3 23 4.9 23 8.1C23 12.5 15.5 21.7 12 21.7C8.5 21.7 1 12.5 1 8.1C1 4.9 3.5 2.3 7 2.3C9 2.3 11 3.5 12 5.3Z',
      filled: true,
    },
  ],
  reactionOutline: [
    {
      d: 'M12 5.3C13 3.5 15 2.3 17 2.3C20.5 2.3 23 4.9 23 8.1C23 12.5 15.5 21.7 12 21.7C8.5 21.7 1 12.5 1 8.1C1 4.9 3.5 2.3 7 2.3C9 2.3 11 3.5 12 5.3Z',
    },
  ],
  reply: [
    {
      d: 'M1 11.4a10.2 10.2 0 0 0 1.1 4.6 10.4 10.4 0 0 0 9.3 5.7 10.2 10.2 0 0 0 4.6-1.1L22 22.7q1.2.5.7-.7L20.7 16a10.2 10.2 0 0 0 1.1-4.6 10.4 10.4 0 0 0-5.7-9.3 10.2 10.2 0 0 0-4.6-1.1h-.6a10.4 10.4 0 0 0-9.8 9.8v.6z',
    },
  ],
  repost: [
    { d: 'M1 8.65l3.3-3.3q.7-.7 1.4 0L9 8.65' },
    { d: 'M12 19h-3a4 4 0 0 1-4-4V5.4' },
    { d: 'M23 15.35l-3.3 3.3q-.7.7-1.4 0L15 15.35' },
    { d: 'M12 5h3a4 4 0 0 1 4 4v9.6' },
  ],
  share: [
    {
      d: 'M5.2 2.4L21.4 9.7A2.5 2.5 0 0 1 21.4 14.3L5.2 21.6A1.8 1.8 0 0 1 2.9 19.1L6.6 12.8A1.5 1.5 0 0 0 6.6 11.2L2.9 4.9A1.8 1.8 0 0 1 5.2 2.4Z',
    },
    { d: 'M8 12h10.5' },
  ],
} satisfies Record<string, Glyph>;

export type HarborSvgName = keyof typeof GLYPHS;

export type HarborSvgProps = Omit<
  ComponentProps<typeof Svg>,
  'color' | 'width' | 'height' | 'viewBox'
> & {
  name: HarborSvgName;
  size?: number;
  color?: string;
};

export function HarborSvg({
  name,
  size = 24,
  color = '#000',
  ...rest
}: HarborSvgProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
      {(GLYPHS[name] as Glyph).map((part) =>
        'd' in part ? (
          <Path
            key={part.d}
            d={part.d}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={part.filled ? color : 'none'}
          />
        ) : (
          <Circle
            key={`${part.cx},${part.cy}`}
            cx={part.cx}
            cy={part.cy}
            r={part.r}
            stroke={color}
            strokeWidth={2}
            fill="none"
          />
        ),
      )}
    </Svg>
  );
}
