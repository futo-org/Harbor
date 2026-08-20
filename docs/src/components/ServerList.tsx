import servers from '@site/src/data/servers.json';
import { useEffect, useState } from 'react';

type ServerEntry = {
  url: string;
  operator: string;
  description: string;
};

type Status =
  | { state: 'checking' }
  | { state: 'online'; latencyMs: number }
  | { state: 'offline' };

/* App palette: positive_500 / negative_500 / neutral_500. */
const DOT_COLOR: Record<Status['state'], string> = {
  online: '#008000',
  offline: '#d9314d',
  checking: '#7c869d',
};

const STATUS_TIMEOUT_MS = 8000;

async function checkStatus(url: string): Promise<Status> {
  const started = Date.now();
  try {
    const response = await fetch(`${url}/status`, {
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    if (!response.ok) return { state: 'offline' };
    return { state: 'online', latencyMs: Date.now() - started };
  } catch {
    return { state: 'offline' };
  }
}

function StatusCell({ status }: { status: Status }) {
  const label =
    status.state === 'online'
      ? `Online (${status.latencyMs} ms)`
      : status.state === 'offline'
        ? 'Offline'
        : 'Checking…';

  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span
        style={{
          display: 'inline-block',
          width: '0.6em',
          height: '0.6em',
          borderRadius: '50%',
          marginRight: '0.5em',
          backgroundColor: DOT_COLOR[status.state],
        }}
      />
      {label}
    </span>
  );
}

const entries = servers as ServerEntry[];

/** Lists the known public servers, checking each one's `/status` live. */
export default function ServerList() {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});

  useEffect(() => {
    let cancelled = false;
    for (const entry of entries) {
      checkStatus(entry.url).then((status) => {
        if (cancelled) return;
        setStatuses((prev) => ({ ...prev, [entry.url]: status }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <table>
      <thead>
        <tr>
          <th>Server</th>
          <th>Operated by</th>
          <th>Description</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.url}>
            <td>
              <a href={entry.url}>{entry.url.replace('https://', '')}</a>
            </td>
            <td>{entry.operator}</td>
            <td>{entry.description}</td>
            <td>
              <StatusCell
                status={statuses[entry.url] ?? { state: 'checking' }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
