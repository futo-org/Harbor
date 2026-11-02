import { useEffect, useReducer } from 'react';
import { AppState } from 'react-native';

export function TimeAgo({ since }: { since: number | bigint }) {
  const [, forceRender] = useReducer((count: number) => count + 1, 0);
  const sinceMs = Number(since);
  const [label] = formatTimeAgo(sinceMs);

  useEffect(() => {
    let handle: ReturnType<typeof setTimeout> | undefined;

    const scheduleNextUpdate = () => {
      const [, msUntilChange] = formatTimeAgo(sinceMs);

      if (msUntilChange === null) return;

      handle = setTimeout(() => {
        forceRender();
        scheduleNextUpdate();
      }, msUntilChange);
    };

    scheduleNextUpdate();

    const appStateSubscription = AppState.addEventListener(
      'change',
      (state) => {
        if (state !== 'active') return;

        clearTimeout(handle);
        forceRender();
        scheduleNextUpdate();
      },
    );

    return () => {
      clearTimeout(handle);
      appStateSubscription.remove();
    };
  }, [sinceMs]);

  return label;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

function formatTimeAgo(
  since: number,
): [label: string, msUntilChange: number | null] {
  if (!since) return ['', null];

  const elapsed = Date.now() - since;

  if (elapsed < MINUTE) {
    return ['now', MINUTE - (elapsed % MINUTE)];
  }
  if (elapsed < HOUR) {
    return [`${Math.floor(elapsed / MINUTE)}m`, MINUTE - (elapsed % MINUTE)];
  }
  if (elapsed < DAY) {
    return [`${Math.floor(elapsed / HOUR)}h`, HOUR - (elapsed % HOUR)];
  }
  if (elapsed < WEEK) {
    return [`${Math.floor(elapsed / DAY)}d`, DAY - (elapsed % DAY)];
  }

  const date = new Date(since);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const label = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });

  return [label, null];
}
