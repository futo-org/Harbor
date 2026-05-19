import { router } from 'expo-router';
import { PostData } from '../lib/polycentric-hooks';

export type OpenComposeOptions = {
  replyTo?: PostData['id'];
  /** Immediately launch the image picker once the composer mounts. */
  attachImage?: boolean;
};

export function openCompose(options: OpenComposeOptions = {}) {
  const { replyTo, attachImage } = options;
  const params = new URLSearchParams();
  if (replyTo) {
    params.set('replyTo', replyTo);
  }
  if (attachImage) params.set('attach', '1');
  const qs = params.toString();
  router.push(
    qs ? `${Routes.tabs.feed.compose}?${qs}` : Routes.tabs.feed.compose,
  );
}

export const Routes = {
  tabs: {
    feed: {
      index: '/feed',
      compose: '/feed/compose',
    },
    search: '/search',
    claims: '/claims',
    identitySwitch: '/identity/switch',
    profile: (identityId: string) => `/${identityId}` as const,
    editProfile: (identityId: string) => `/${identityId}/edit` as const,
    post: (identityId: string, keyFingerprint: string, sequence: string) =>
      `/${identityId}/post/${keyFingerprint}/${sequence}` as const,
    settings: {
      index: '/settings',
      identity: '/settings/identity',
      pairIdentity: '/settings/pair-identity',
      servers: '/settings/servers',
      verificationAuthorities: '/settings/verification-authorities',
      privateKey: '/settings/private-key',
      appearance: '/settings/appearance',
      moderationSettings: '/settings/moderation-settings',
      blockedTopics: '/settings/blocked-topics',
      blockedUsers: '/settings/blocked-users',
      clientInformation: '/settings/client-information',
      switchIdentity: '/settings/switch-identity',
      removeIdentities: '/settings/remove-identities',
      reportBug: '/settings/report-bug',
    },
  },
  onboarding: {
    index: '/',
    signup: {
      setDisplayName: '/signup/set_display_name',
      setAbout: '/signup/set_about',
      setAvatar: '/signup/set_avatar',
      setModeration: '/signup/set_moderation',
    },
  },
} as const;
