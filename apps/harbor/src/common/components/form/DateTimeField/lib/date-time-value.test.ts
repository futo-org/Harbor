import { fromDate, monthGrid, timeOptions, toDate } from './date-time-value';

describe('fromDate', () => {
  it('formats dates and times', () => {
    expect(fromDate('date', new Date(2027, 2, 5, 23, 59))).toBe('2027-03-05');
    expect(fromDate('time', new Date(2027, 2, 5, 7, 4))).toBe('07:04');
  });
});

describe('toDate', () => {
  const fallback = new Date(2026, 0, 1, 12, 0);

  it('reads back what fromDate gave', () => {
    expect(fromDate('time', toDate('time', '19:30', fallback))).toBe('19:30');
  });

  it('falls back when the value is empty or invalid', () => {
    expect(toDate('date', '', fallback)).toBe(fallback);
    expect(toDate('time', '7pm', fallback)).toBe(fallback);
  });
});

describe('monthGrid', () => {
  it('pads the month to whole weeks', () => {
    // 1 March 2027 is a Monday
    expect(monthGrid(2027, 2, 1).slice(0, 3)).toEqual([1, 2, 3]);
    expect(monthGrid(2027, 2, 1)).toHaveLength(35);
    expect(monthGrid(2027, 2, 0).slice(0, 3)).toEqual([null, 1, 2]);
  });
});

describe('timeOptions', () => {
  it('covers the day in steps', () => {
    const options = timeOptions(15);

    expect(options).toHaveLength(96);
    expect(options.at(-1)).toBe('23:45');
  });
});
