import { publicEnv } from '@/src/common/util/env';
import {
  FEATURE_FLAG_NAMES,
  FEATURE_FLAGS,
  type FeatureFlag,
  type FeatureFlagValues,
} from './flags';

/**
 * The defaults a build sets, from `anywhere=true,other=false`. Names this
 * build does not have and values that are neither are left out.
 */
export function parseFeatureFlagDefaults(raw: string | undefined) {
  const defaults: FeatureFlagValues = {};
  for (const entry of (raw ?? '').split(',')) {
    const [name, value] = entry.split('=').map((part) => part.trim());
    const flag = FEATURE_FLAG_NAMES.find((known) => known === name);
    if (flag && (value === 'true' || value === 'false')) {
      defaults[flag] = value === 'true';
    }
  }
  return defaults;
}

// EXPO_PUBLIC_HARBOR_FEATURE_FLAGS, set for a build or, on web, the container.
const BUILD_DEFAULTS = parseFeatureFlagDefaults(
  publicEnv(
    'EXPO_PUBLIC_HARBOR_FEATURE_FLAGS',
    process.env.EXPO_PUBLIC_HARBOR_FEATURE_FLAGS,
  ),
);

/**
 * Whether `flag` is on. A switch in settings wins; a flag never switched
 * follows the build's default, else the one in `FEATURE_FLAGS`. Values from a
 * server would go between the two.
 */
export function resolveFeatureFlag(
  flag: FeatureFlag,
  switched: FeatureFlagValues,
  buildDefaults: FeatureFlagValues = BUILD_DEFAULTS,
): boolean {
  return switched[flag] ?? buildDefaults[flag] ?? FEATURE_FLAGS[flag].default;
}
