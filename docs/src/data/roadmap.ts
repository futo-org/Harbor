// Newest first. Items without a date are planned, labelled `when` (default
// "Soon"). A phase entry labels everything below it. A gap entry spans a
// period without listed items.

export type RoadmapItem = {
  title: string;
  description: string;
  date?: string;
  when?: string;
  version?: string;
  commit?: string;
  milestone?: boolean;
  link?: { label: string; to: string };
};

export type RoadmapPhase = { phase: string };

export type RoadmapGap = { gap: string; when: string; description: string };

export const roadmap: (RoadmapItem | RoadmapPhase | RoadmapGap)[] = [
  {
    when: '2027 - Q1',
    title: 'harbor.surf 🏄‍♂️',
    description:
      'Comment on and react to any page on the web, from a blog post to a video, and see what others are saying about it. Comes with a browser extension.',
  },
  {
    when: '2027 - Q1',
    title: 'Web of Trust',
    description:
      'Build your own web of trust from your network. The people you trust, and the people they trust, help you tell real accounts from fakes without relying on a central authority.',
  },
  {
    title: 'Identity switching',
    description: 'Use more than one identity on devices.',
  },
  {
    title: 'Embedded media',
    description: 'Media players and animated GIFs inside posts.',
  },
  {
    title: 'Alpha release',
    description: 'Harbor leaves pre-alpha and is open for public testing.',
    milestone: true,
  },
  { phase: 'Pre-alpha' },
  {
    title: 'Harbor merch store',
    description: 'Shirts and more, for anyone who wants to show their support.',
  },
  {
    title: 'Continuous syncing',
    description:
      'Events from one device show up on your other devices without a reload.',
  },
  {
    title: 'Grayjay migration',
    description:
      'Grayjay comments and ratings move to Harbor, and Grayjay users keep their keys.',
  },
  {
    date: '2026-10-09',
    version: 'v2.19.0',
    title: 'Unread notifications',
    description:
      'An unread counter for notifications, kept up to date across your devices.',
  },
  {
    date: '2026-09-04',
    version: 'v2.16.0',
    title: 'Mentions and hashtags',
    description: 'Mention autocomplete, better mention rendering and hashtags.',
  },
  {
    date: '2026-08-28',
    version: 'v2.15.0',
    title: 'Suggested follows',
    description: 'Suggested people to follow in a sidebar on the web.',
  },
  {
    date: '2026-08-21',
    version: 'v2.14.0',
    title: 'Identity backups',
    description:
      'Back up your identity to a file and recover it without another device.',
  },
  {
    date: '2026-08-21',
    version: 'v2.14.0',
    title: 'Blocking',
    description: 'Block other identities.',
  },
  {
    date: '2026-08-10',
    version: 'v2.12.0',
    title: 'Search',
    description: 'Search for people and posts.',
  },
  {
    date: '2026-07-24',
    version: 'v2.0.9',
    title: 'Platform verifications',
    description:
      'Prove you own accounts on X, YouTube, GitHub, Discord and more, checked by an automated verifier.',
  },
  {
    date: '2026-07-16',
    version: 'v2.0.8',
    title: 'Rebrand to Harbor',
    description:
      'The Polycentric app becomes Harbor. Polycentric stays the name of the protocol.',
    milestone: true,
  },
  {
    date: '2026-07-10',
    version: 'v2.0.6',
    title: 'Verifications',
    description:
      'Publish claims about yourself and ask people you choose to verify them. Verified claims show on your profile.',
  },
  {
    date: '2026-07-06',
    version: 'v2.0.5',
    title: 'Aliases',
    description:
      'Use a domain you own as a memorable name for your identity, like you@yourdomain.com.',
    link: { label: 'Set up an alias', to: '/docs/guides/setting-up-an-alias' },
  },
  {
    date: '2026-06-12',
    version: 'v2.0.1',
    title: 'Push notifications',
    description:
      'Get notified on your phone when people reply, react, mention or follow you.',
  },
  {
    date: '2026-06-04',
    commit: 'd5f3626e2bdb81eab12479004f7c8124ae408831',
    title: 'New moderation service',
    description:
      'A standalone service scans every post and image, and publishes signed labels that any server can subscribe to. Anyone can run their own. You choose per label whether matching posts are hidden, covered with a warning or shown.',
  },
  {
    date: '2026-05-28',
    commit: '787371137e93dc5c950bdc948f814becdcdf3e50',
    title: 'Emoji reactions',
    description: 'React to posts with emoji.',
  },
  {
    date: '2026-05-27',
    commit: '2d1c9162b9476b57afe27bcc5b7cf75c4eafabe3',
    title: 'Reposts and quote posts',
    description:
      'Repost a post to your followers, or quote it with your own comment.',
  },
  {
    date: '2026-05-04',
    commit: '7a3f407ae727fc96d43a525440eeb0dc24d8150d',
    title: 'Identity pairing',
    description:
      'Add a new device to your identity by pairing it with one you have.',
  },
  {
    date: '2026-04-13',
    commit: 'ce2c5cf0fd52a9aac8aff982207c03d00177f473',
    title: 'Reworked identity layer',
    description:
      'An identity is a signed document of keys, so one identity spans many devices and keys can be rotated.',
  },
  {
    date: '2026-03-30',
    commit: 'f28580292056d5c4bda9f281bdeb93f340e727f0',
    title: 'Events and content separated',
    description:
      'Signed events reference their content by digest instead of carrying it, so content can be deleted while the event history stays verifiable.',
  },
  {
    date: '2026-03-09',
    commit: '3ea10a21adbe27bccaf15e0ead6ef7339d3b3543',
    title: 'Mark joins the team',
    description: 'Mark Harding joins FUTO to help build Polycentric.',
    link: {
      label: 'mark@futo.tech',
      to: 'https://harbor.social/mark@futo.tech',
    },
  },
  {
    gap: 'Research and prototyping',
    when: '2024 - 2025',
    description:
      'Experiments on the original protocol. What we learned shaped the redesign that followed.',
  },
  {
    date: '2023-10-10',
    title: 'Polycentric in Grayjay',
    description:
      'Grayjay launches with Polycentric built in. Comments and ratings on videos from any platform are signed by the people who wrote them, not owned by the platform.',
    link: { label: 'grayjay.app', to: 'https://grayjay.app' },
  },
  {
    date: '2023-06-13',
    commit: '3a35127d56a718800e2860105df6b2f84dcf9ffd',
    title: 'The first Harbor',
    description:
      'A web app named Harbor shows the accounts people claim on other platforms, and who has vouched for those claims.',
  },
  {
    date: '2022-10-05',
    commit: 'b744010130bb61978d13f1caa6792672471d148b',
    title: 'Polycentric begins',
    description:
      'FUTO starts building Polycentric, an open protocol for distributed social media.',
    milestone: true,
  },
];
