import servers from '@site/src/data/servers.json';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import styles from './ApiReference.module.css';
import { SettingsContext } from './settings';

export const CUSTOM_SERVER = 'custom';
const DEFAULT_CUSTOM = 'http://localhost:3000';

/** Opens the collapsed schema entry the URL hash points at. */
function useHashReveal() {
  useEffect(() => {
    const reveal = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) return;
      const target = document.getElementById(hash);
      if (!target) return;
      let opened = false;
      for (
        let node: HTMLElement | null = target;
        node;
        node = node.parentElement
      ) {
        if (node instanceof HTMLDetailsElement && !node.open) {
          node.open = true;
          opened = true;
        }
      }
      if (opened) target.scrollIntoView();
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, []);
}

/** Holds the Try it out settings for every method on the page. */
export function ApiProvider({ children }: { children: ReactNode }) {
  const [serverChoice, setServerChoice] = useState(
    servers[0]?.url ?? CUSTOM_SERVER,
  );
  const [customServer, setCustomServer] = useState(DEFAULT_CUSTOM);
  const [authorization, setAuthorization] = useState('');
  useHashReveal();

  const settings = useMemo(
    () => ({
      server: serverChoice === CUSTOM_SERVER ? customServer : serverChoice,
      authorization,
      serverChoice,
      customServer,
      setServerChoice,
      setCustomServer,
      setAuthorization,
    }),
    [serverChoice, customServer, authorization],
  );

  return (
    <SettingsContext.Provider value={settings}>
      <div className={styles.root}>{children}</div>
    </SettingsContext.Provider>
  );
}
