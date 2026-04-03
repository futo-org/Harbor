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
    <div style={{ border: '1px solid #666', padding: '12px', margin: '8px 0' }}>
      <h3>Servers</h3>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <input
          type="text"
          value={newServer}
          onChange={(e) => setNewServer(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addServer()}
          style={{ flex: 1, padding: '4px' }}
          placeholder="http://localhost:50051"
        />
        <button onClick={addServer}>Add</button>
      </div>

      {client.servers.length === 0 && (
        <div style={{ color: '#888', fontSize: '0.85em', marginBottom: '8px' }}>
          No servers configured
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px 0' }}>
        {client.servers.map((server) => (
          <li
            key={server}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '4px 0',
              fontSize: '0.9em',
              fontFamily: 'monospace',
            }}
          >
            {server}
            <button onClick={() => removeServer(server)} style={{ marginLeft: '8px' }}>
              ×
            </button>
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={push} disabled={syncing || client.servers.length === 0}>
          Push
        </button>
        <button onClick={pull} disabled={syncing || client.servers.length === 0}>
          Pull
        </button>
        <button onClick={sync} disabled={syncing || client.servers.length === 0}>
          Sync
        </button>
      </div>

      {status && (
        <div style={{ marginTop: '8px', fontSize: '0.85em', color: '#888' }}>
          {status}
        </div>
      )}
    </div>
  );
};
