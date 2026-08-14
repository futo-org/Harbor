import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';

const APPS = [
  {
    title: 'Web',
    description:
      'Use Harbor in your browser, nothing to install. Works on desktop and mobile.',
    linkLabel: 'Open harbor.social',
    href: 'https://harbor.social',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        className="h-10 w-10"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="11" />
        <path d="M1 12h22" />
        <path d="M12 1c-4 3.5-4 18.5 0 22" />
        <path d="M12 1c4 3.5 4 18.5 0 22" />
      </svg>
    ),
  },
  {
    title: 'Android',
    description:
      'Download the APK directly. The app keeps itself up to date with new releases.',
    linkLabel: 'Download APK',
    href: 'https://static.harbor.social/apk/production/harbor-latest.apk',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="#fff"
        className="h-10 w-10"
        aria-hidden="true"
      >
        <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4483-.9993.9993-.9993c.5511 0 .9993.4483.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4483.9993.9993 0 .5511-.4483.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396" />
      </svg>
    ),
  },
  {
    title: 'iOS',
    description: 'Join the TestFlight beta to get Harbor on iPhone and iPad.',
    linkLabel: 'Join TestFlight',
    href: 'https://testflight.apple.com/join/bZ8py7Ny',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="#fff"
        className="h-10 w-10"
        aria-hidden="true"
      >
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.03 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.56-1.702" />
      </svg>
    ),
  },
];

export default function Apps() {
  return (
    <Layout title="Apps" description="Get Harbor on the web, Android, and iOS">
      <div className="landing-page bg-neutral-900 text-white">
        <header className="relative flex min-h-[50vh] flex-col items-center justify-center gap-6 bg-[linear-gradient(180deg,rgba(26,31,41,0)_55%,#1a1f29_100%),url('/img/harbor-splash-alt.svg')] bg-cover bg-center px-6 pt-28 pb-16 text-center text-white">
          <h1 className="m-0 text-5xl leading-[1.1] font-extrabold md:text-[4.25rem]">
            Apps
          </h1>
          <p className="m-0 max-w-2xl  absolute bottom-10 text-2xl font-bold py-10">
            Get started with our official apps below
          </p>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-6 md:grid-cols-3">
            {APPS.map((app) => (
              <div key={app.title} className="flex flex-col rounded-2xl  p-8">
                {app.icon}
                <h3 className="mt-4 mb-3 text-2xl font-bold">{app.title}</h3>
                <p className="m-0 grow text-neutral-300">{app.description}</p>
                <Link
                  className="mt-8 rounded-full bg-primary-500 px-6 py-3 text-center font-bold text-white hover:bg-primary-400 hover:text-white hover:no-underline"
                  href={app.href}
                >
                  {app.linkLabel}
                </Link>
              </div>
            ))}
          </div>
        </main>
      </div>
    </Layout>
  );
}
