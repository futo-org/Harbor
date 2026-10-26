// Fictional people and posts.

export const people = {
  maya: {
    name: 'Emma Carter',
    handle: 'emma@carter.dev',
    initials: 'EC',
    colors: ['#FF8833', '#FFC049'],
    key: 'a3f9c2e17b04d6885e1f9a2c7d3b6e40f18c5a9d2b7e3f6c1a8d4b0e9f2c7a51',
    bio: 'Printmaker in Portland. Runs on coffee and ferry timetables.',
    following: 214,
    followers: '1,982',
  },
  priya: {
    name: 'Sarah Mitchell',
    handle: 'sarah@mitchell.me',
    initials: 'SM',
    colors: ['#7C86FF', '#1EA3E5'],
  },
  theo: {
    name: 'Tom Reynolds',
    handle: '7c2e91ab4f',
    keyOnly: true,
    initials: 'TR',
    colors: ['#2FA82F', '#A8E4A8'],
  },
  lena: {
    name: 'Laura Bennett',
    handle: 'laura@bennett.studio',
    initials: 'LB',
    colors: ['#D9314D', '#FFA05C'],
  },
  jonas: {
    name: 'James Walker',
    handle: 'james@walker.photo',
    initials: 'JW',
    colors: ['#1EA3E5', '#47AC47'],
  },
  sam: {
    name: 'Sam Hughes',
    handle: '2b8de07a19',
    keyOnly: true,
    initials: 'SD',
    colors: ['#5F6B7F', '#A8B2C4'],
  },
  club: {
    name: 'Northwind Trail Club',
    handle: 'club@northwind.run',
    photo: 'river.jpg',
  },
};

export const posts = {
  fjord: {
    author: 'jonas',
    time: '2h',
    text: 'Sunrise over the fjord this morning. Worth every one of the 4am alarms. 🌅',
    images: ['fjord.jpg'],
    replies: 14,
    reposts: 9,
    reactions: ['🔥', '❤️', '😍'],
    reactionCount: 48,
  },
  keys: {
    author: 'priya',
    time: '3h',
    text: 'Switched phones last night. Scanned one QR code and everything was just… there. My posts, my follows, all of it. No password reset, no support ticket.',
    replies: 6,
    reposts: 3,
    reactions: ['👏', '💯'],
    reactionCount: 21,
  },
  studio: {
    author: 'lena',
    time: '5h',
    text: 'New studio, new light. First batch of prints goes out Friday 🧵',
    images: ['desk.jpg'],
    replies: 3,
    reposts: 1,
    reactions: ['❤️'],
    reactionCount: 12,
  },
  run: {
    author: 'club',
    time: '7h',
    text: 'Saturday long run is on. 7am at the waterfall trailhead, all paces welcome.',
    images: ['waterfall.jpg'],
    replies: 8,
    reposts: 4,
    reactions: ['🏃', '🔥'],
    reactionCount: 19,
  },
  coffee: {
    author: 'maya',
    time: '1d',
    text: 'Coffee first, carving second. The new linocut is fighting me. ☕',
    images: ['coffee.jpg'],
    replies: 4,
    reposts: 0,
    reactions: ['☕', '❤️'],
    reactionCount: 15,
  },
  market: {
    author: 'maya',
    time: '3d',
    text: 'Strawberry season at the harbour market. Bought too many, regret nothing.',
    images: ['strawberries.jpg'],
    replies: 2,
    reposts: 1,
    reactions: ['🍓'],
    reactionCount: 9,
  },
  puppy: {
    author: 'priya',
    time: '1d',
    text: 'Meet Biscuit. He has already claimed the good chair.',
    images: ['puppy.jpg'],
    replies: 22,
    reposts: 5,
    reactions: ['😍', '🐶', '❤️'],
    reactionCount: 73,
  },
};

export const replies = [
  { author: 'priya', time: '2h', text: 'Okay this is unreal. Which trail?' },
  {
    author: 'jonas',
    time: '1h',
    text: 'Preikestolen. Started walking at 3:40 🥱',
  },
  {
    author: 'theo',
    time: '45m',
    text: 'Saving this for summer. Any chance of a print?',
  },
];

export const servers = {
  active: ['srv.harbor.social', 'srv.polycentric.io', 'harbor.northwind.run'],
  suggested: ['srv.lighthouse.example'],
};

export const claims = [
  {
    platform: 'github',
    title: 'github.com/emmacarter',
    time: '3d',
    verified: true,
  },
  {
    platform: 'youtube',
    title: 'youtube.com/@EmmaMakes',
    time: '3d',
    verified: true,
  },
  { platform: 'x', title: 'x.com/emmacarter', time: '1w', verified: true },
  { platform: 'web', title: 'emmacarter.dev', time: '1w', verified: true },
  {
    platform: 'work',
    title: 'Printmaker at Studio Bennett',
    time: '2w',
    verified: false,
  },
];

export const verifiedPlatforms = [
  { platform: 'github', account: 'emmacarter' },
  { platform: 'youtube', account: '@EmmaMakes' },
  { platform: 'web', account: 'emmacarter.dev' },
];

export const moderationLabels = [
  {
    name: 'Hate',
    description: 'Hate speech or incitement against groups',
    level: 'hide',
  },
  {
    name: 'Self-Harm',
    description: 'Self-harm, eating disorders, suicide',
    level: 'warn',
  },
  {
    name: 'Sexually Suggestive',
    description: 'Innuendo or implied sexual acts',
    level: 'warn',
  },
  {
    name: 'Sexually Explicit',
    description: 'Pornography or explicit sexual acts',
    level: 'hide',
  },
  {
    name: 'Violence',
    description: 'Violent acts, gore, injury, or terrorism',
    level: 'warn',
  },
];

export const notifications = [
  { kind: 'follow', actor: 'priya', time: '5m' },
  { kind: 'reaction', actor: 'theo', emoji: '🔥', time: '12m', post: 'coffee' },
  {
    kind: 'reply',
    actor: 'sam',
    time: '40m',
    text: 'Count me in for Saturday 🏃 Is the trailhead car park open that early?',
  },
  { kind: 'repost', actor: 'lena', time: '1h', post: 'market' },
  { kind: 'verificationRequest', actor: 'jonas', time: '3h' },
  { kind: 'reaction', actor: 'club', emoji: '👏', time: '6h', post: 'market' },
];

export const slides = [
  {
    id: '01-feed',
    screen: 'feed',
    theme: 'orange',
    headline: 'Share to the world, not platforms.',
    sub: 'You hold the keys, and your posts go to every server you choose.',
  },
  {
    id: '02-identity',
    screen: 'profile',
    theme: 'dark',
    headline: 'Sovereign identity.',
    sub: 'Your identity is keys you create and keep, not an account a company can suspend.',
  },
  {
    id: '03-servers',
    screen: 'servers',
    theme: 'light',
    headline: 'No silos.',
    sub: 'Every post goes to all the servers you use. If one shuts down or bans you, your audience can still reach you through the rest.',
  },
  {
    id: '04-verifications',
    screen: 'verifications',
    theme: 'orange',
    headline: 'Nobody else can post as you.',
    sub: 'Verify your GitHub, YouTube, X or website so anyone can check it’s really you.',
  },
  {
    id: '05-reactions',
    screen: 'post',
    theme: 'dark',
    headline: 'React with any emoji.',
    sub: 'Replies, quotes, reposts and a full emoji picker.',
  },
  {
    id: '06-moderation',
    screen: 'moderation',
    theme: 'light',
    headline: 'Moderation you choose.',
    sub: 'No single company decides what you see. Pick the servers whose moderation you trust.',
  },
  {
    id: '07-notifications',
    screen: 'notifications',
    theme: 'orange',
    headline: 'Never miss a reply.',
    sub: 'Push notifications for follows, replies, reactions and verifications.',
  },
];
