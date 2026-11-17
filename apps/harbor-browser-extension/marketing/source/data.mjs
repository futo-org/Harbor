// Fictional page, comments and slide headlines. The people are the ones in
// apps/harbor/marketing/source/data.mjs.

/** Who the side panel is signed in as. */
export const viewer = 'maya';

export const page = {
  site: 'Northwind Journal',
  domain: 'northwind.run',
  url: 'northwind.run/journal/open-trail-maps',
  title: 'Why our trail maps are open to everyone',
  description:
    'Three years of mapping the coast path, and why we gave it all away.',
  photo: 'coast.jpg',
  author: 'club',
  date: 'May 12',
  paragraphs: [
    'When we started mapping the coast path, the plan was a printed guide for members. Three summers and four hundred kilometres later, we have something better: a map anyone can use, correct or build on.',
    'Every waymark, ferry crossing and water tap is published under an open license. Walkers send us corrections, and the next person out gets a better map than the last.',
  ],
};

export const comments = [
  {
    author: 'jonas',
    time: '12m',
    text: 'Used these on the coast path last weekend. The ferry overlay saved us a two hour wait.',
    reposts: 2,
  },
  {
    author: 'priya',
    time: '34m',
    text: 'More clubs should do this. A paywalled map helps nobody when the signal drops.',
    replies: 2,
    reposts: 5,
  },
  {
    author: 'theo',
    time: '1h',
    text: 'Is the GPX export up to date for the northern section?',
    replies: 1,
  },
  {
    author: 'lena',
    time: '2h',
    text: 'Printed the harbour loop for the studio wall. Beautiful work.',
  },
];

/** The comment opened as a thread, and the replies under it. */
export const thread = {
  post: comments[1],
  replies: [
    {
      author: 'jonas',
      time: '20m',
      text: 'Agreed. We keep an offline copy on every phone in the group.',
    },
    {
      author: 'club',
      time: '8m',
      text: 'Thank you! That was exactly the idea.',
    },
  ],
};

export const draft =
  'Walked the harbour loop this morning. The new waymarks are great.';

export const slides = [
  {
    id: '01-comments',
    panel: 'comments',
    theme: 'orange',
    headline: 'Comments on any page.',
    sub: 'Open the side panel to see what people on Harbor say about the page you are on.',
  },
  {
    id: '02-threads',
    panel: 'thread',
    theme: 'dark',
    headline: 'Join the conversation.',
    sub: 'Reply, react and repost without leaving the page.',
  },
  {
    id: '03-compose',
    panel: 'compose',
    theme: 'light',
    headline: 'Post as yourself.',
    sub: 'Sign in from your Harbor tab. Your comments are signed with your keys.',
  },
];
