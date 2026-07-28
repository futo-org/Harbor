import { Button, Text } from '@/src/common/components';
import { Atoms, useTheme } from '@/src/common/theme';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SelectChip } from '../../SelectChip';
import { type Platform, PLATFORMS } from '../../utils/platforms';
import { type VerifierType, verifierApi } from '../../utils/verifier-api';

// The platform grid, narrowed to what the verifier servers support and
// tagged with the verifier type (text preferred over oauth). If no server is
// reachable (or none support any platform) an error with retry is shown —
// listing unverifiable platforms would only dead-end at the verify step.
export function ClaimCreatePlatformPicker({
  onSelect,
}: {
  onSelect: (platform: Platform, verifierType: VerifierType) => void;
}) {
  const { theme } = useTheme();
  const [available, setAvailable] = useState<
    { platform: Platform; verifierType: VerifierType }[] | null
  >(null);
  const [failed, setFailed] = useState(false);

  // Fetches on mount and again whenever retry() clears `failed`.
  useEffect(() => {
    if (failed) return;
    let alive = true;
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
        if (supported.length > 0) setAvailable(supported);
        else setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [failed]);

  const retry = () => {
    setAvailable(null);
    setFailed(false);
  };

  if (failed) {
    return (
      <View style={[Atoms.gap_md, Atoms.items_start]}>
        <Text variant="body" style={theme.atoms.text_neutral_medium}>
          Could not reach any of the configured verification servers. Check your
          connection and try again.
        </Text>
        <Button title="Try again" variant="secondary" onPress={retry} />
      </View>
    );
  }

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
