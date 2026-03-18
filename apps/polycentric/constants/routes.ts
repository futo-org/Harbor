// TODO: abandon systemKey terminology in lib and apps. just use publicKey
export const Routes = {
  tabs: {
    feed: '/feed',
    search: '/search',
    claims: '/claims',
    profile: '/profile',
    settings: {
      index: '/settings',
      polycentricServers: '/settings/polycentric-servers',
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
  profile: (publicKey: string) => `/feed/profile/${publicKey}` as const,
  post: (postId: string) => `/feed/post/${postId}` as const,
} as const;
