import useModerationStatus from './hooks/useModerationStatus';

/**
 * Holds a moderation-status subscription for the app's lifetime so the
 * `IsModerator` fan-out starts at app launch (and re-runs on identity
 * switch) instead of waiting for the first screen that asks, and the
 * shared query never unwinds between consumers. Mounted once inside
 * `PolycentricProvider` in the root layout.
 */
export default function ModerationStatusPrefetch() {
  useModerationStatus();
  return null;
}
