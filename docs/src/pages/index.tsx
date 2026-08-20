import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

// Line-art illustrations: 220×160 viewBox, white strokes (opacity carries
// the depth).
const FEATURES = [
  {
    title: 'Sovereign identity',
    body: 'Your identity is made of cryptographic keypairs that you create for free and keep yourself. It is not an account that a company can suspend. Nobody else can post as you, and nobody can take your name, your history, or your followers.',
    cta: {
      label: 'How identities work',
      to: '/docs/protocol/overview#identities-and-keys',
    },
    icon: (
      <>
        {/* Profile card */}
        <rect x="24" y="28" width="116" height="84" rx="12" />
        <circle cx="56" cy="60" r="14" />
        <path d="M84 52h40" opacity="0.6" />
        <path d="M84 68h28" opacity="0.6" />
        <path d="M40 96h64" opacity="0.35" />
        {/* Verified badge */}
        <circle cx="132" cy="40" r="11" />
        <path d="M127 40l4 4 7-8" />
        {/* Key held by the owner */}
        <circle cx="154" cy="112" r="16" />
        <path d="M166 100L200 66" />
        <path d="M184 82l9 9" />
        <path d="M192 74l7 7" />
        {/* Sparkles */}
        <path className="viz-sparkle" d="M178 28v14M171 35h14" opacity="0.55" />
        <circle
          className="viz-sparkle"
          cx="202"
          cy="48"
          r="2.5"
          opacity="0.55"
          style={{ animationDelay: '0.9s' }}
        />
        <path
          className="viz-sparkle"
          d="M42 128v10M37 133h10"
          opacity="0.4"
          style={{ animationDelay: '1.4s' }}
        />
        <circle
          className="viz-sparkle"
          cx="26"
          cy="138"
          r="2.5"
          opacity="0.4"
          style={{ animationDelay: '0.5s' }}
        />
      </>
    ),
  },
  {
    title: 'No silos',
    body: 'You post to the world, not to a server. Every post goes to all the servers you use. If one shuts down or bans you, your audience can still reach you through the rest.',
    cta: { label: 'Run your own server', to: '/docs/guides/running-a-server' },
    icon: (
      <>
        {/* The world */}
        <circle cx="62" cy="80" r="30" />
        <path d="M32 80h60" opacity="0.6" />
        <path d="M62 50c-12 11-12 49 0 60" opacity="0.6" />
        <path d="M62 50c12 11 12 49 0 60" opacity="0.6" />
        <path d="M37 65h50" opacity="0.35" />
        <path d="M37 95h50" opacity="0.35" />
        {/* Servers it reaches */}
        <rect x="154" y="22" width="46" height="26" rx="6" />
        <circle cx="165" cy="35" r="2.5" />
        <path d="M174 35h18" opacity="0.6" />
        <rect x="154" y="66" width="46" height="26" rx="6" />
        <circle cx="165" cy="79" r="2.5" />
        <path d="M174 79h18" opacity="0.6" />
        <rect x="154" y="110" width="46" height="26" rx="6" />
        <circle cx="165" cy="123" r="2.5" />
        <path d="M174 123h18" opacity="0.6" />
        {/* Fan-out with posts in flight */}
        <path className="viz-flow" d="M92 66c22-16 38-27 60-31" />
        <path
          className="viz-flow"
          d="M94 80h58"
          style={{ animationDelay: '0.5s' }}
        />
        <path
          className="viz-flow"
          d="M92 94c22 16 38 27 60 31"
          style={{ animationDelay: '1s' }}
        />
        <circle className="viz-dot" cx="124" cy="52" r="3.5" />
        <circle
          className="viz-dot"
          cx="124"
          cy="80"
          r="3.5"
          style={{ animationDelay: '0.45s' }}
        />
        <circle
          className="viz-dot"
          cx="124"
          cy="108"
          r="3.5"
          style={{ animationDelay: '0.9s' }}
        />
        {/* Sparkles */}
        <path className="viz-sparkle" d="M28 28v12M22 34h12" opacity="0.5" />
        <circle
          className="viz-sparkle"
          cx="112"
          cy="24"
          r="2.5"
          opacity="0.5"
          style={{ animationDelay: '1.1s' }}
        />
      </>
    ),
  },
  {
    title: 'Moderation you choose',
    body: 'No single company decides what you see. Each server sets its own policy, and you pick the servers whose moderation you trust. You can change your mind at any time without losing anything.',
    cta: {
      label: 'How moderation works',
      to: '/docs/guides/running-a-server#content-moderation--removal',
    },
    icon: (
      <>
        {/* Shield */}
        <path d="M58 20l38 14v28c0 24-16 41-38 52-22-11-38-28-38-52V34z" />
        <path d="M42 66l12 12 22-28" />
        {/* Policy switches you flip */}
        <rect x="120" y="40" width="72" height="20" rx="10" />
        <circle className="viz-knob-off" cx="180" cy="50" r="11" />
        <rect x="120" y="76" width="72" height="20" rx="10" />
        <circle
          className="viz-knob-on"
          cx="132"
          cy="86"
          r="11"
          style={{ animationDelay: '0.4s' }}
        />
        <rect x="120" y="112" width="72" height="20" rx="10" />
        <circle
          className="viz-knob-off"
          cx="180"
          cy="122"
          r="11"
          style={{ animationDelay: '0.8s' }}
        />
        {/* Sparkles */}
        <path className="viz-sparkle" d="M158 18v12M152 24h12" opacity="0.55" />
        <circle
          className="viz-sparkle"
          cx="204"
          cy="80"
          r="2.5"
          opacity="0.5"
          style={{ animationDelay: '0.7s' }}
        />
        <circle
          className="viz-sparkle"
          cx="104"
          cy="142"
          r="2.5"
          opacity="0.5"
          style={{ animationDelay: '1.5s' }}
        />
      </>
    ),
  },
  {
    title: 'Recommendations that answer to you',
    body: 'Your feed is ranked for you, not for advertisers. Harbor is built so that you choose the recommendation engine, see why it recommended something, and tune it or swap it out.',
    cta: { label: 'Explore the feed APIs', to: '/docs/protocol/grpc' },
    icon: (
      <>
        {/* Social graph the engine walks */}
        <circle cx="40" cy="40" r="12" />
        <circle cx="96" cy="24" r="9" />
        <circle cx="72" cy="90" r="13" />
        <circle cx="126" cy="60" r="9" />
        <circle cx="44" cy="126" r="9" />
        <circle cx="108" cy="128" r="7" />
        <path d="M48 49l17 30" opacity="0.5" />
        <path d="M84 84l33-19" opacity="0.5" />
        <path d="M100 32l19 20" opacity="0.5" />
        <path d="M50 118l14-18" opacity="0.5" />
        <path d="M84 96l17 26" opacity="0.5" />
        {/* A liked post (app reaction glyph) */}
        <g transform="translate(150 18) scale(0.9)">
          <path
            className="viz-heart"
            d="M12 5.3C13 3.5 15 2.3 17 2.3C20.5 2.3 23 4.9 23 8.1C23 12.5 15.5 21.7 12 21.7C8.5 21.7 1 12.5 1 8.1C1 4.9 3.5 2.3 7 2.3C9 2.3 11 3.5 12 5.3Z"
            vectorEffect="non-scaling-stroke"
          />
        </g>
        {/* Tuning it */}
        <path d="M136 104h64" opacity="0.5" />
        <circle className="viz-slide-rev" cx="172" cy="104" r="8" />
        <path d="M136 130h64" opacity="0.5" />
        <circle
          className="viz-slide"
          cx="152"
          cy="130"
          r="8"
          style={{ animationDelay: '0.6s' }}
        />
        {/* Sparkle */}
        <circle
          className="viz-sparkle"
          cx="202"
          cy="62"
          r="2.5"
          opacity="0.55"
        />
      </>
    ),
  },
];

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout description={siteConfig.tagline}>
      <div className="landing-page bg-neutral-900 text-white">
        <header
          id="homepage-hero"
          className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-[linear-gradient(180deg,rgba(26,31,41,0)_75%,#1a1f29_100%),url('/img/harbor-scene-splash.svg')] bg-cover bg-center px-6 pt-24 pb-[28vh] text-center text-white md:pb-24"
        >
          <h1 className="m-0 max-w-4xl text-5xl leading-[1.1] text-shadow-sm font-extrabold md:text-[4.25rem]">
            {siteConfig.tagline}
          </h1>
          <Link
            className="rounded-full bg-primary-500 px-8 py-3 text-lg font-bold text-white shadow-lg hover:bg-primary-400 hover:text-white hover:no-underline"
            href="https://harbor.social"
          >
            Join Harbor
          </Link>
          <p className="absolute inset-x-0 bottom-30 mx-auto mb-0 max-w-4xl px-6 text-base font-bold md:text-2xl">
            You hold the keys, and your posts go to every server you choose.
          </p>
        </header>
        <main>
          {FEATURES.map((feature, i) => (
            <section
              key={feature.title}
              className={`${i % 2 ? 'bg-white/5' : ''} ${'border-0 border-b-10 border-solid border-white/20'}`}
            >
              <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 py-48 md:flex-row md:gap-20">
                <div
                  className={`flex shrink-0 items-center justify-center ${
                    i % 2 ? 'md:order-last' : ''
                  }`}
                >
                  <svg
                    viewBox="0 0 220 160"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="viz-float h-52 w-72"
                    aria-hidden="true"
                  >
                    {feature.icon}
                  </svg>
                </div>
                <div className="md:flex-1">
                  <h2 className="mt-0 mb-4 text-3xl font-extrabold md:text-[2.6rem] md:leading-[1.2]">
                    {feature.title}
                  </h2>
                  <p className="m-0 text-lg text-neutral-100">{feature.body}</p>
                  <Link
                    className="mt-8 inline-flex items-center gap-2 rounded-full border-2 border-solid border-white/40 px-6 py-2.5 font-bold text-white hover:border-white hover:text-white hover:no-underline"
                    to={feature.cta.to}
                  >
                    {feature.cta.label}
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M7 17L17 7" />
                      <path d="M9 7h8v8" />
                    </svg>
                  </Link>
                </div>
              </div>
            </section>
          ))}
          <p className="mx-auto mb-0 max-w-6xl px-6 py-12 text-center text-lg text-neutral-300">
            Built in the open on the{' '}
            <Link
              className="font-semibold text-primary-300 hover:text-primary-400"
              to="/docs/protocol/overview"
            >
              Polycentric Protocol
            </Link>
            . Run your own server, build your own client, or{' '}
            <Link
              className="font-semibold text-primary-300 hover:text-primary-400"
              to="/docs/protocol/verifiers"
            >
              verify identities
            </Link>{' '}
            across platforms.
          </p>
        </main>
      </div>
    </Layout>
  );
}
