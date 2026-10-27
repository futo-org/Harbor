// Store listing source. export.mjs writes app-store/ and play-store/ from it.

const tagline = 'Share to the world, not platforms.';

const pillars = [
  {
    title: 'Sovereign identity',
    body: 'Your identity is made of cryptographic keypairs that you create for free and keep yourself. It is not an account that a company can suspend. Nobody else can post as you, and nobody can take your name, your history, or your followers. Add a second device by scanning a QR code, and keep a backup so you can recover without asking anyone’s permission.',
  },
  {
    title: 'No silos',
    body: 'You post to the world, not to a server. Every post goes to all the servers you use. If one shuts down or bans you, your audience can still reach you through the rest. Pick your servers in Settings and change them whenever you like.',
  },
  {
    title: 'Moderation you choose',
    body: 'No single company decides what you see. Each server sets its own policy, and you pick the servers whose moderation you trust. Content labels let you hide, warn, or show posts in each category, and you can report any post or block any user.',
  },
  {
    title: 'Recommendations that answer to you',
    body: 'Your feed is ranked for you, not for advertisers. The For You feed is computed by the servers you use, and each suggestion is attributed to the server that made it, so no single server controls what you see. Switch to Following for the people you follow, newest first or ranked.',
  },
  {
    title: 'Everything you expect from a social app',
    bullets: [
      'Posts up to 2000 characters with up to four photos and link previews',
      'Replies, quotes, reposts, and emoji reactions',
      'Follow people across any server',
      'Search for posts and people across your servers',
      'Push notifications for follows, replies, reactions, and verifications',
      'Readable usernames backed by a domain you control, like you@yourdomain.com',
      'Verifications: prove you own your GitHub, YouTube, X, Discord, Twitch, or website, and let people you trust vouch for claims about you',
      'Light and dark themes',
    ],
  },
  {
    title: 'Built in the open',
    body: 'Harbor is the flagship app for the Polycentric Protocol. The protocol, the app, and the server are open source, and anyone can run a server or build a client that interoperates with the rest of the network. Browse Explore and Search without creating an identity.',
  },
];

const intro = `${tagline}

Harbor is an open-source, distributed social network. You hold the keys, and your posts go to every server you choose. No company owns the network, and no single server owns you.`;

const outro = 'Docs and source: https://join.harbor.social';

function description(heading) {
  const sections = pillars.map((p) => {
    const body = p.bullets ? p.bullets.map((b) => `• ${b}`).join('\n') : p.body;
    return `${heading(p.title)}\n${body}`;
  });
  return [intro, ...sections, outro].join('\n\n');
}

export const urls = {
  marketing: 'https://join.harbor.social',
  support: 'https://join.harbor.social/docs/support',
  privacyPolicy: 'https://join.harbor.social/docs/privacy-policy',
  storeContentPolicy:
    'https://join.harbor.social/docs/content-policy-app-stores',
};

export const releaseNotes = `${tagline} You hold the keys, and your posts go to every server you choose.`;

export const signInInstructions = [
  'There is no sign-in. Explore and Search work without an identity.',
  'To post, follow or react, tap "Create identity" on the welcome screen and enter a display name. No email, phone or password is needed.',
].join(' ');

export const appStore = {
  appId: '6504881935',
  bundleId: 'org.futo.polycentric',
  locale: 'en-US',
  name: 'Harbor: Share to the world',
  subtitle: 'You hold the keys',
  promotionalText:
    'You hold the keys, and your posts go to every server you choose. An open-source social network built on the Polycentric Protocol.',
  description: description((t) => t.toUpperCase()),
  keywords: [
    'social',
    'decentralized',
    'distributed',
    'open source',
    'fediverse',
    'mastodon',
    'nostr',
    'bluesky',
    'privacy',
    'network',
  ],
  whatsNew: `Harbor is now on the App Store. ${releaseNotes}`,
  copyright: '2026 FUTO Holdings Inc.',
  primaryCategory: 'SOCIAL_NETWORKING',
  secondaryCategory: 'NEWS',
  contentRightsDeclaration: 'USES_THIRD_PARTY_CONTENT',
  releaseType: 'MANUAL',
  ageRating: {
    advertising: false,
    alcoholTobaccoOrDrugUseOrReferences: 'NONE',
    contests: 'NONE',
    gambling: false,
    gamblingSimulated: 'NONE',
    gunsOrOtherWeapons: 'NONE',
    healthOrWellnessTopics: false,
    lootBox: false,
    medicalOrTreatmentInformation: 'NONE',
    messagingAndChat: false,
    parentalControls: false,
    profanityOrCrudeHumor: 'INFREQUENT_OR_MILD',
    ageAssurance: false,
    sexualContentGraphicAndNudity: 'NONE',
    sexualContentOrNudity: 'INFREQUENT_OR_MILD',
    socialMedia: true,
    socialMediaAgeRestricted: false,
    horrorOrFearThemes: 'NONE',
    matureOrSuggestiveThemes: 'INFREQUENT_OR_MILD',
    unrestrictedWebAccess: false,
    userGeneratedContent: true,
    violenceCartoonOrFantasy: 'NONE',
    violenceRealistic: 'NONE',
    violenceRealisticProlongedGraphicOrSadistic: 'NONE',
    ageRatingOverrideV2: 'NONE',
    koreaAgeRatingOverride: 'NONE',
  },
  price: { baseTerritory: 'USA', customerPrice: '0.0' },
  availability: { allTerritories: true, availableInNewTerritories: true },
  reviewNotes: [
    signInInstructions,
    `Users can report any post from its "..." menu and block any user from their profile. Content policy: ${urls.storeContentPolicy}`,
    'The app does not use non-exempt encryption.',
  ].join('\n\n'),
  screenshots: {
    APP_IPHONE_67: 'screenshots/iphone-6.9',
    APP_IPAD_PRO_3GEN_129: 'screenshots/ipad-13',
  },
  icon: 'icons/app-store-icon-1024.png',
  creativeAssets: {
    PRODUCT_PAGE_HEADER_ASSET: 'screenshots/app-store-header.png',
    APP_STORE_SEARCH_RESULTS_ASSET: 'screenshots/app-store-search.png',
  },
  limits: {
    name: 30,
    subtitle: 30,
    promotionalText: 170,
    description: 4000,
    keywords: 100,
    whatsNew: 4000,
    reviewNotes: 4000,
  },
};

export const playStore = {
  packageName: 'org.futo.polycentric.store',
  language: 'en-US',
  title: 'Harbor',
  shortDescription:
    'Share to the world, not platforms. You hold the keys to your posts and audience.',
  fullDescription: description((t) => `<b>${t}</b>`),
  releaseNotes: `Harbor is now on Google Play. ${releaseNotes}`,
  defaultLanguage: 'en-US',
  contactEmail: 'support@harbor.social',
  contactWebsite: 'https://join.harbor.social',
  contactPhone: '',
  dataSafetyCsv: 'play-store/data-safety.csv',
  // No API for these; set in Play Console.
  appContent: {
    category: 'Social',
    tags: ['Social network', 'Open source'],
    privacyPolicyUrl: 'https://join.harbor.social/docs/privacy-policy',
    ads: 'No, the app does not contain ads',
    appAccess: {
      restricted: true,
      instructions: signInInstructions,
    },
    contentRating: {
      category: 'Social networking, forums, blogs, UGC sharing',
      userInteraction:
        'Users can interact and share user-generated content; content is moderated and users can report and block',
      violence: 'No',
      sexuality: 'No',
      language: 'No',
      controlledSubstances: 'No',
      gambling: 'No',
      fear: 'No',
      otherSensitive: 'No',
    },
    targetAudience: {
      ageGroups: ['18 and over'],
      appealsToChildren:
        'No, the app is not designed for or likely to appeal to children',
    },
    newsApp: 'No',
    covidContactTracing: 'No',
    governmentApp: 'No',
    financialFeatures: 'None',
    healthApp: 'None',
  },
  images: {
    phoneScreenshots: 'screenshots/android-phone',
    tenInchScreenshots: 'screenshots/android-tablet-10',
    featureGraphic: 'screenshots/android-feature-graphic.png',
    icon: 'icons/play-store-icon-512.png',
  },
  limits: {
    title: 30,
    shortDescription: 80,
    fullDescription: 4000,
    releaseNotes: 500,
  },
};

// Declared once for Google's Data safety form and Apple's App Privacy labels.
export const dataCollection = {
  encryptedInTransit: true,
  userRequestDelete: true,
  accountCreation: {
    methods: ['PSL_ACM_OTHER'],
    description:
      'An identity is a cryptographic key pair created on the device when the user taps "Create identity". No username, password, email or phone number is involved.',
    deletionUrl: urls.privacyPolicy,
  },
  dataDeletionUrl: urls.privacyPolicy,
  outsideAppAccounts: false,
  independentSecurityReview: false,
  types: [
    {
      what: 'Display name, public on the profile',
      google: 'PSL_NAME',
      apple: { category: 'Contact Info', type: 'Name' },
      required: true,
      purposes: ['APP_FUNCTIONALITY', 'ACCOUNT_MANAGEMENT'],
    },
    {
      what: 'Identity key and alias',
      google: 'PSL_USER_ACCOUNT',
      apple: { category: 'Identifiers', type: 'User ID' },
      required: true,
      purposes: ['APP_FUNCTIONALITY', 'ACCOUNT_MANAGEMENT'],
    },
    {
      what: 'Avatar and post images',
      google: 'PSL_PHOTOS',
      apple: { category: 'User Content', type: 'Photos or Videos' },
      required: false,
      purposes: ['APP_FUNCTIONALITY'],
    },
    {
      what: 'Posts, replies and bio',
      google: 'PSL_USER_GENERATED_CONTENT',
      apple: { category: 'User Content', type: 'Other User Content' },
      required: false,
      purposes: ['APP_FUNCTIONALITY'],
    },
    {
      what: 'Follows, reactions and reposts, all public',
      google: 'PSL_OTHER_APP_ACTIVITY',
      apple: { category: 'User Content', type: 'Other User Content' },
      required: false,
      purposes: ['APP_FUNCTIONALITY'],
    },
    {
      what: 'Push notification token',
      google: 'PSL_DEVICE_ID',
      apple: { category: 'Identifiers', type: 'Device ID' },
      required: false,
      purposes: ['APP_FUNCTIONALITY'],
    },
  ],
};

export const purposeNames = {
  APP_FUNCTIONALITY: {
    google: 'PSL_APP_FUNCTIONALITY',
    apple: 'App Functionality',
  },
  ACCOUNT_MANAGEMENT: {
    google: 'PSL_ACCOUNT_MANAGEMENT',
    apple: 'App Functionality',
  },
  ANALYTICS: { google: 'PSL_ANALYTICS', apple: 'Analytics' },
  PERSONALIZATION: {
    google: 'PSL_PERSONALIZATION',
    apple: 'Product Personalization',
  },
  FRAUD_PREVENTION_SECURITY: {
    google: 'PSL_FRAUD_PREVENTION_SECURITY',
    apple: 'App Functionality',
  },
  DEVELOPER_COMMUNICATIONS: {
    google: 'PSL_DEVELOPER_COMMUNICATIONS',
    apple: 'Other Purposes',
  },
  ADVERTISING: {
    google: 'PSL_ADVERTISING',
    apple: "Developer's Advertising or Marketing",
  },
};

export function overLimit(store) {
  return Object.entries(store.limits).flatMap(([field, limit]) => {
    const value = store[field];
    const length = Array.isArray(value) ? value.join(',').length : value.length;
    return length > limit ? [`${field} (${length}/${limit})`] : [];
  });
}
