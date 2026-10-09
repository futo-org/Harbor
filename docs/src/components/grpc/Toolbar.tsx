import servers from '@site/src/data/servers.json';
import { CUSTOM_SERVER } from './ApiProvider';
import styles from './ApiReference.module.css';
import { useSettings } from './settings';

/** Server and authorization used by the Try it out panels. */
export function Toolbar() {
  const settings = useSettings();
  return (
    <div className={styles.toolbar}>
      <label className={styles.field}>
        <span>Server for Try it out</span>
        <select
          className={styles.input}
          value={settings.serverChoice}
          onChange={(event) => settings.setServerChoice(event.target.value)}
        >
          {servers.map((server) => (
            <option key={server.url} value={server.url}>
              {server.url.replace(/^https?:\/\//, '')} ({server.operator})
            </option>
          ))}
          <option value={CUSTOM_SERVER}>Custom URL</option>
        </select>
      </label>
      {settings.serverChoice === CUSTOM_SERVER && (
        <label className={styles.field}>
          <span>Server URL</span>
          <input
            className={styles.input}
            type="url"
            value={settings.customServer}
            onChange={(event) => settings.setCustomServer(event.target.value)}
          />
        </label>
      )}
      <label className={styles.field}>
        <span>Authorization header</span>
        <input
          className={styles.input}
          type="text"
          placeholder="Bearer <token>, optional"
          autoComplete="off"
          value={settings.authorization}
          onChange={(event) => settings.setAuthorization(event.target.value)}
        />
      </label>
    </div>
  );
}
