import { Button, Text, TextInput } from '@/src/common/components';
import { Atoms, PaletteColorToken, useTheme } from '@/src/common/theme';
import { FontAwesome6 } from '@expo/vector-icons';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { ReactNode, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedRef,
} from 'react-native-reanimated';
import { CopyLinkComponent } from '../CopyLinkComponent';
import { SelectChip } from '../SelectChip';
import { useScrollIntoView } from '../VerificationsScrollContext';

// A platform a claim can be verified against. `logo` matches SelectChip's icon
// render-prop; `color` tints the logo and its chip; `location` is where the
// pairing token goes (used in the instructions).
interface Platform {
  name: string;
  logo: (props: { size: number; color: string }) => ReactNode;
  color: PaletteColorToken;
  location: string;
  // Example profile URL shown in the input.
  placeholder: string;
  // A catch-all for any website not in the list (changes the wording).
  generic?: boolean;
}

const brandLogo =
  (name: string) =>
  ({ size, color }: { size: number; color: string }): ReactNode => (
    <FontAwesome6 name={name} brand size={size} color={color} />
  );

const solidLogo =
  (name: string) =>
  ({ size, color }: { size: number; color: string }): ReactNode => (
    <FontAwesome6 name={name} size={size} color={color} />
  );

const PLATFORMS: Platform[] = [
  {
    name: 'X',
    logo: brandLogo('x-twitter'),
    color: 'neutral_900',
    location: 'bio',
    placeholder: 'x.com/futo',
  },
  {
    name: 'YouTube',
    logo: brandLogo('youtube'),
    color: 'negative_500',
    location: 'channel description',
    placeholder: 'youtube.com/futo_tech',
  },
  {
    name: 'GitHub',
    logo: brandLogo('github'),
    color: 'neutral_600',
    location: 'profile bio',
    placeholder: 'github.com/futo-org',
  },
  {
    name: 'Discord',
    logo: brandLogo('discord'),
    color: 'primary_500',
    location: 'About Me',
    placeholder: 'discord.gg/futo',
  },
  {
    name: 'Hacker News',
    logo: brandLogo('hacker-news'),
    color: 'warning_500',
    location: 'about section',
    placeholder: 'news.ycombinator.com/user?id=futo',
  },
  // FontAwesome6 has no Rumble brand glyph; use a generic play icon.
  {
    name: 'Rumble',
    logo: solidLogo('circle-play'),
    color: 'positive_500',
    location: 'channel description',
    placeholder: 'rumble.com/c/futo',
  },
  {
    name: 'Twitch',
    logo: brandLogo('twitch'),
    color: 'primary_400',
    location: 'bio',
    placeholder: 'twitch.tv/futo',
  },
  {
    name: 'Other',
    logo: solidLogo('ellipsis'),
    color: 'neutral_500',
    location: 'profile',
    placeholder: 'example.com',
    generic: true,
  },
];

// Accepts a profile URL or bare domain: a valid host (FQDN) with an optional
// scheme and path, e.g. "youtube.com/futo-tech" or "https://example.com".
function isProfileUrl(value: string): boolean {
  const host = value
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0];
  return /^([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/i.test(host);
}

// Pick a platform, then link the account by pasting a pairing token into it.
export function ClaimCreatePlatformPicker() {
  const { theme } = useTheme();
  const { identityKey } = useCurrentIdentity();
  const [selected, setSelected] = useState<Platform>();
  const [profileUrl, setProfileUrl] = useState('');

  const scrollIntoView = useScrollIntoView();
  const linkFormRef = useAnimatedRef<Animated.View>();
  const pendingScroll = useRef(false);

  // Loop-back link the user adds to their profile to prove ownership.
  const loopbackLink = identityKey
    ? `https://polycentric.io/${identityKey}`
    : '';

  const onSelectPlatform = (platform: Platform) => {
    setSelected(platform);
    setProfileUrl('');
    pendingScroll.current = true;
  };

  const onLinkFormLayout = () => {
    if (!pendingScroll.current) return;
    pendingScroll.current = false;
    scrollIntoView(linkFormRef);
  };

  return (
    <View style={Atoms.gap_sm}>
      <Text
        variant="small"
        style={theme.atoms.text_neutral_medium}
        fontWeight="semibold"
      >
        Choose a platform to verify with
      </Text>

      <View style={[Atoms.flex_row, Atoms.gap_sm, Atoms.flex_wrap]}>
        {PLATFORMS.map((platform, i) => (
          <Animated.View
            key={platform.name}
            entering={FadeInDown.delay(i * 40).duration(200)}
          >
            <SelectChip
              title={platform.name}
              icon={platform.logo}
              color={platform.color}
              selected={selected?.name === platform.name}
              onPress={() => onSelectPlatform(platform)}
            />
          </Animated.View>
        ))}
      </View>

      {selected && (
        <Animated.View
          ref={linkFormRef}
          key={selected.name}
          entering={FadeInDown.duration(200)}
          exiting={FadeOutDown.duration(150)}
          onLayout={onLinkFormLayout}
          style={[Atoms.gap_sm, Atoms.mt_sm]}
        >
          <Text
            variant="small"
            style={theme.atoms.text_neutral_medium}
            fontWeight="semibold"
          >
            {selected.generic
              ? 'Link your website'
              : `Link your ${selected.name} account`}
          </Text>
          <TextInput
            value={profileUrl}
            onChangeText={setProfileUrl}
            placeholder={selected.placeholder}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Loop-back link the user adds to their profile. */}
          <CopyLinkComponent link={loopbackLink} />
          <Text variant="small" style={theme.atoms.text_neutral_medium}>
            {selected.generic
              ? 'Add this link anywhere on your website.'
              : `Add this link to your ${selected.name} social links or ${selected.location}.`}{' '}
            It may take a few minutes after updating for verification to
            succeed. Removing the link may result in the verification being
            revoked in the future.
          </Text>

          <Button
            title="Verify"
            variant="primary"
            disabled={!isProfileUrl(profileUrl) || !loopbackLink}
            // TODO: start the platform loop-back verification flow.
            onPress={() => {}}
          />
        </Animated.View>
      )}
    </View>
  );
}
