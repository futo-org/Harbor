type FeatureFlagDefinition = {
  /** Shown in settings. */
  label: string;
  description: string;
  /** Whether it is on where neither settings nor the build say. */
  default: boolean;
};

/**
 * Features that can be switched on and off in settings. To add one, add an
 * entry here and read it with `useFeatureFlag`. The key is the name builds and
 * stored settings use, so renaming one loses what they set.
 */
export const FEATURE_FLAGS = {
  anywhere: {
    label: 'Anywhere',
    description: 'Comments on any page on the web, in the navigation.',
    default: false,
  },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/** Some flags' values, as settings and a build each hold them. */
export type FeatureFlagValues = Partial<Record<FeatureFlag, boolean>>;

export const FEATURE_FLAG_NAMES = Object.keys(FEATURE_FLAGS) as FeatureFlag[];
