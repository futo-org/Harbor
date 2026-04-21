import { router } from 'expo-router';

export function openCompose(replyTo?: {
  identityId: string;
  sequence: string;
}) {
  if (replyTo) {
    const path = `${encodeURIComponent(replyTo.identityId)}/${encodeURIComponent(replyTo.sequence)}`;
    router.push(`${Routes.tabs.feed.compose}?replyTo=${path}`);
  } else {
    router.push(Routes.tabs.feed.compose);
  }
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
    post: (identityId: string, postId: string) =>
      `/${identityId}/post/${postId}` as const,
    settings: {
      index: '/settings',
      identity: '/settings/identity',
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
      setUsername: '/signup/set_username',
      setAbout: '/signup/set_about',
      setAvatar: '/signup/set_avatar',
      setModeration: '/signup/set_moderation',
    },
  },
} as const;
