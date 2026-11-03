import { act, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Text } from 'react-native';
import { TimeAgo } from './TimeAgo';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const NOW = new Date('2026-06-15T12:00:00Z').getTime();

const originalToLocaleDateString = Date.prototype.toLocaleDateString;

// Rendering queues microtasks, which would otherwise count as pending timers
jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });

beforeEach(() => {
  jest.setSystemTime(NOW);
  // Pin the locale and timezone the machine would otherwise pick
  jest.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (
    this: Date,
    _locale,
    options,
  ) {
    return originalToLocaleDateString.call(this, 'en-US', {
      ...options,
      timeZone: 'UTC',
    });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TimeAgo', () => {
  it.each([
    [0, 'now'],
    [MINUTE - 1, 'now'],
    [MINUTE, '1m'],
    [HOUR - 1, '59m'],
    [HOUR, '1h'],
    [DAY - 1, '23h'],
    [DAY, '1d'],
    [WEEK - 1, '6d'],
  ])('shows %ims ago as %s', async (elapsed, label) => {
    await renderTimeAgo(NOW - elapsed);
    expect(getLabel()).toBe(label);
  });

  it('shows a date without the year once a week old', async () => {
    await renderTimeAgo(NOW - WEEK);
    expect(getLabel()).toBe('Jun 8');
  });

  it('shows the year for dates from a previous year', async () => {
    await renderTimeAgo(new Date('2025-03-01T12:00:00Z').getTime());
    expect(getLabel()).toBe('Mar 1, 2025');
  });

  it('updates exactly when the label changes', async () => {
    await renderTimeAgo(NOW);

    await advanceTime(MINUTE - 1);
    expect(getLabel()).toBe('now');
    await advanceTime(1);
    expect(getLabel()).toBe('1m');

    await advanceTime(HOUR - MINUTE - 1);
    expect(getLabel()).toBe('59m');
    await advanceTime(1);
    expect(getLabel()).toBe('1h');

    await advanceTime(DAY - HOUR);
    expect(getLabel()).toBe('1d');

    await advanceTime(WEEK - DAY);
    expect(getLabel()).toBe('Jun 15');
    // Dates don't change, so nothing is left scheduled
    expect(jest.getTimerCount()).toBe(0);
  });

  it('catches up on resume when timers lagged behind the clock', async () => {
    const appState = captureAppStateListener();
    await renderTimeAgo(NOW);

    // Like an Android device sleeping: the clock moves, timers don't fire
    jest.setSystemTime(NOW + 10 * HOUR);
    expect(getLabel()).toBe('now');

    await appState.emit('active');
    expect(getLabel()).toBe('10h');
    expect(jest.getTimerCount()).toBe(1);

    await advanceTime(HOUR);
    expect(getLabel()).toBe('11h');
  });

  it('cleans up its timer and app state listener on unmount', async () => {
    const appState = captureAppStateListener();
    const { unmount } = await renderTimeAgo(NOW);
    expect(jest.getTimerCount()).toBe(1);

    await unmount();
    expect(jest.getTimerCount()).toBe(0);
    expect(appState.remove).toHaveBeenCalled();
  });
});

function renderTimeAgo(since: number) {
  return render(
    <Text testID="time-ago">
      <TimeAgo since={since} />
    </Text>,
  );
}

function getLabel() {
  return screen.getByTestId('time-ago').children.join('');
}

function advanceTime(ms: number) {
  return act(() => {
    jest.advanceTimersByTime(ms);
  });
}

function captureAppStateListener() {
  let listener: ((state: AppStateStatus) => void) | undefined;
  const remove = jest.fn();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, handler) => {
      listener = handler;
      return { remove };
    });
  return {
    emit: (state: AppStateStatus) =>
      act(() => {
        listener?.(state);
      }),
    remove,
  };
}
