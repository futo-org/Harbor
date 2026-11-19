import { parseImageIndex } from './parseImageIndex';

describe('parseImageIndex', () => {
  it('maps the 1-based URL param to a 0-based index', () => {
    expect(parseImageIndex('1', 4)).toBe(0);
    expect(parseImageIndex('4', 4)).toBe(3);
  });

  it('clamps out-of-range values into the list', () => {
    expect(parseImageIndex('0', 4)).toBe(0);
    expect(parseImageIndex('-2', 4)).toBe(0);
    expect(parseImageIndex('9', 4)).toBe(3);
  });

  it('falls back to the first image on junk', () => {
    expect(parseImageIndex('banana', 4)).toBe(0);
    expect(parseImageIndex('', 4)).toBe(0);
  });

  it('handles an empty image list', () => {
    expect(parseImageIndex('3', 0)).toBe(0);
  });
});
