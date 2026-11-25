export type DateTimeMode = 'date' | 'time';

const pad = (value: number) => String(value).padStart(2, '0');

/** YYYY-MM-DD and HH:MM, the values the fields hold */
export const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

export const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};
export const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
};

/** Date to YYYY-MM-DD or HH:MM */
export function fromDate(mode: DateTimeMode, date: Date): string {
  return mode === 'date'
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Field value to a local Date. Uses the fallback if empty or invalid */
export function toDate(
  mode: DateTimeMode,
  value: string,
  fallback = new Date(),
): Date {
  const match = (mode === 'date' ? DATE_PATTERN : TIME_PATTERN).exec(value);
  if (!match) return fallback;

  const date = new Date(fallback);

  if (mode === 'date') {
    date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  } else {
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  }

  return date;
}

/** Field value formatted for display */
export function formatValue(mode: DateTimeMode, value: string): string {
  const date = toDate(mode, value);

  return mode === 'date'
    ? date.toLocaleDateString(undefined, DATE_FORMAT)
    : date.toLocaleTimeString(undefined, TIME_FORMAT);
}

/** Days of the month as a grid of weeks. null pads the start and end */
export function monthGrid(
  year: number,
  month: number,
  firstDay: number,
): (number | null)[] {
  const lead = (new Date(year, month, 1).getDay() - firstDay + 7) % 7;
  const days = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

/** Every time of day in steps, as HH:MM */
export function timeOptions(stepMinutes: number): string[] {
  const options: string[] = [];

  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    options.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  }

  return options;
}
