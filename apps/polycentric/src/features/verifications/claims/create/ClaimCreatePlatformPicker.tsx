import { Atoms, useTheme } from '@/src/common/theme';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SelectChip } from '../../SelectChip';
import { type Platform, PLATFORMS } from '../../utils/platforms';
import { type VerifierType, verifierApi } from '../../utils/verifier-api';

// The platform grid, narrowed to what the verifier servers support and
// tagged with the verifier type (text preferred over oauth). If no server is
// reachable the full list is shown; the verify step reports the real error.
export function ClaimCreatePlatformPicker({
  onSelect,
}: {
  onSelect: (platform: Platform, verifierType: VerifierType) => void;
}) {
  const { theme } = useTheme();
  const [available, setAvailable] = useState<
    { platform: Platform; verifierType: VerifierType }[] | null
  >(null);

  useEffect(() => {
    let alive = true;
    const fallback = PLATFORMS.map((platform) => ({
      platform,
      verifierType: 'text' as const,
    }));
    verifierApi
      .platformVerifiers()
      .then((verifiers) => {
        if (!alive) return;
        const supported = PLATFORMS.flatMap((platform) => {
          const types = verifiers.get(platform.slug);
          if (!types) return [];
          const verifierType: VerifierType = types.has('text')
            ? 'text'
            : 'oauth';
          return [{ platform, verifierType }];
        });
        setAvailable(supported.length > 0 ? supported : fallback);
      })
      .catch(() => {
        if (alive) setAvailable(fallback);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!available) {
    return (
      <ActivityIndicator
        size="small"
        color={theme.palette.primary_500}
        accessibilityLabel="Loading platforms"
      />
    );
  }

  return (
    <View style={[Atoms.flex_row, Atoms.gap_sm, Atoms.flex_wrap]}>
      {available.map(({ platform, verifierType }, i) => (
        <Animated.View
          key={platform.name}
          entering={FadeInDown.delay(i * 40).duration(200)}
        >
          <SelectChip
            title={platform.name}
            icon={platform.logo}
            color={platform.color}
            onPress={() => onSelect(platform, verifierType)}
          />
        </Animated.View>
      ))}
    </View>
  );
}
