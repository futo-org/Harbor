import { useContext, useState } from 'react';
import { ClientContext } from '../../main';

export const SyncPanel = () => {
  const client = useContext(ClientContext);
  const [newServer, setNewServer] = useState('');
  const [status, setStatus] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [, forceUpdate] = useState(0);

  if (!client) return null;

  const addServer = () => {
    const url = newServer.trim();
    if (url && !client.servers.includes(url)) {
      client.servers.push(url);
      setNewServer('');
      forceUpdate((n) => n + 1);
    }
  };

  const removeServer = (url: string) => {
    client.servers = client.servers.filter((s) => s !== url);
    forceUpdate((n) => n + 1);
  };

  const push = async () => {
    setSyncing(true);
    setStatus('Pushing...');
    try {
      await client.push();
      setStatus(`Pushed to ${client.servers.length} server(s)`);
    } catch (error) {
      setStatus(`Push failed: ${error}`);
    } finally {
      setSyncing(false);
    }
  };

  const pull = async () => {
    setSyncing(true);
    setStatus('Pulling...');
    try {
      const newCount = await client.pull();
      setStatus(`Pulled ${newCount} new event(s)`);
      if (newCount > 0) {
        client.events.emitContentCreated(null as never);
      }
    } catch (error) {
      setStatus(`Pull failed: ${error}`);
    } finally {
      setSyncing(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    setStatus('Syncing...');
    try {
      const newCount = await client.sync();
      setStatus(`Synced. ${newCount} new event(s) pulled.`);
      if (newCount > 0) {
        client.events.emitContentCreated(null as never);
      }
    } catch (error) {
      setStatus(`Sync failed: ${error}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="card">
      <h3>Servers</h3>

      {client.servers.map((server) => (
        <div
          key={server}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 0',
            fontSize: '0.85rem',
            fontFamily: 'monospace',
            color: '#8b949e',
          }}
        >
          {server}
          <button
            onClick={() => removeServer(server)}
            style={{ padding: '2px 8px', fontSize: '0.8rem' }}
          >
            remove
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          type="text"
          value={newServer}
          onChange={(e) => setNewServer(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addServer()}
          placeholder="http://localhost:3000"
          style={{ flex: 1 }}
        />
        <button onClick={addServer}>Add</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          onClick={push}
          disabled={syncing || client.servers.length === 0}
        >
          Push
        </button>
        <button
          onClick={pull}
          disabled={syncing || client.servers.length === 0}
        >
          Pull
        </button>
        <button
          onClick={sync}
          disabled={syncing || client.servers.length === 0}
        >
          Sync
        </button>
      </div>

      {status && (
        <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#8b949e' }}>
          {status}
        </div>
      )}
    </div>
  );
};
