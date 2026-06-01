import { PaletteColorToken, useTheme } from '@/src/common/theme';
import {
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
} from '@expo/vector-icons';
import { ComponentProps, ComponentType, ReactNode } from 'react';

function defineIcon<G extends string>(
  IconSet: ComponentType<any> & { glyphMap: Record<G, number | string> },
  name: NoInfer<G>,
) {
  return {
    iconSet: IconSet,
    name,
    render: (p: object) => <IconSet name={name} {...p} />,
  };
}

/**
 * Map of icon names to their icon set definitions
 */
export const IconsMap = {
  add: defineIcon(Ionicons, 'add'),
  addOutline: defineIcon(Ionicons, 'add-circle-outline'),
  arrowBack: defineIcon(Ionicons, 'arrow-back'),
  ban: defineIcon(Ionicons, 'ban'),
  camera: defineIcon(Ionicons, 'camera-outline'),
  checkmark: defineIcon(Ionicons, 'checkmark'),
  checkmarkCircle: defineIcon(Ionicons, 'checkmark-circle'),
  checkmarkSharp: defineIcon(Ionicons, 'checkmark-sharp'),
  chevronBack: defineIcon(Ionicons, 'chevron-back'),
  chevronDown: defineIcon(Ionicons, 'chevron-down'),
  chevronForward: defineIcon(Ionicons, 'chevron-forward'),
  close: defineIcon(Ionicons, 'close'),
  closeSharp: defineIcon(Ionicons, 'close-sharp'),
  copy: defineIcon(Ionicons, 'copy-outline'),
  dotsVertical: defineIcon(MaterialCommunityIcons, 'dots-vertical'),
  emoji: defineIcon(MaterialIcons, 'emoji-emotions'),
  flag: defineIcon(Ionicons, 'flag-outline'),
  home: defineIcon(Ionicons, 'home-outline'),
  image: defineIcon(Ionicons, 'image-outline'),
  images: defineIcon(Ionicons, 'images-outline'),
  more: defineIcon(Ionicons, 'ellipsis-horizontal'),
  personAdd: defineIcon(Ionicons, 'person-add'),
  personAddOutline: defineIcon(Ionicons, 'person-add-outline'),
  personOutline: defineIcon(Ionicons, 'person-outline'),
  personRemove: defineIcon(Ionicons, 'person-remove'),
  quote: defineIcon(Ionicons, 'create'),
  reaction: defineIcon(Ionicons, 'heart'),
  reactionOutline: defineIcon(Ionicons, 'heart-outline'),
  remove: defineIcon(Ionicons, 'remove-circle-outline'),
  reply: defineIcon(Ionicons, 'chatbubble-outline'),
  repost: defineIcon(Ionicons, 'repeat'),
  search: defineIcon(Ionicons, 'search'),
  searchOutline: defineIcon(Ionicons, 'search-outline'),
  settings: defineIcon(Ionicons, 'settings-outline'),
  share: defineIcon(Ionicons, 'share-social-outline'),
  themeDark: defineIcon(Ionicons, 'moon'),
  themeLight: defineIcon(Ionicons, 'sunny'),
  time: defineIcon(Ionicons, 'time-outline'),
  trash: defineIcon(Ionicons, 'trash-outline'),
  trashBin: defineIcon(Ionicons, 'trash-bin'),
};

export type IconName = keyof typeof IconsMap;

/** A palette token (resolved against the theme) or any raw color string. */
type IconColor = PaletteColorToken | (string & {});

export type IconProps = Omit<
  ComponentProps<typeof Ionicons>,
  'name' | 'color' | 'size'
> & {
  name: IconName;
  size?: number;
  /** Palette token (resolved against the active theme) or a raw color string. */
  color?: IconColor;
};

export default function Icon({
  name,
  size = 16,
  color = 'neutral_1000',
  ...rest
}: IconProps): ReactNode {
  const { theme } = useTheme();

  // Palette tokens resolve against the theme; anything else is passed through as
  // a literal color (e.g. a resolved color injected via render-prop / cloneElement).
  const resolvedColor =
    color in theme.palette ? theme.palette[color as PaletteColorToken] : color;

  return IconsMap[name].render({ size, color: resolvedColor, ...rest });
}
