import { router } from 'expo-router';

export function openCompose(replyToPostId?: string) {
  if (replyToPostId) {
    router.push(
      `${Routes.tabs.feed.compose}?replyTo=${encodeURIComponent(replyToPostId)}`,
    );
  } else {
    router.push(Routes.tabs.feed.compose);
  }
}

// TODO: abandon systemKey terminology in lib and apps. just use publicKey
export const Routes = {
  tabs: {
    feed: {
      index: '/feed',
      compose: '/feed/compose',
      identity: '/feed/identity',
    },
    search: '/search',
    claims: '/claims',
    profile: (publicKey: string) => `/profile/${publicKey}` as const,
    post: Object.assign((postId: string) => `/post/${postId}` as const, {
      reply: (postId: string, replyTo: string) =>
        `/post/${postId}?replyTo=${encodeURIComponent(replyTo)}` as const,
    }),
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
