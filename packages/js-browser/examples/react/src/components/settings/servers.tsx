import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ClientContext } from '../../main';

export const ServerSelector = () => {
  const client = useContext(ClientContext);

  const [servers] = useState<string[]>([]);
  const serverField = useRef<HTMLInputElement | null>(null);

  const loadIdentities = useCallback(async () => {
    if (client === null) return;
    // TODO: surface configured servers once the query API lands for v2.
  }, [client]);

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  if (client === null) return <div>Error: No client object provided</div>;

  const addServer = async (_server: string) => {
    // TODO: wire up once client exposes a server-management API for v2.
    loadIdentities();
  };

  const removeServer = async (_server: string) => {
    // TODO: wire up once client exposes a server-management API for v2.
    loadIdentities();
  };

  const addServerFromInput = () => {
    if (!serverField.current) return;

    addServer(serverField.current.value);
  };

  return (
    <div>
      {servers.map((server) => (
        <div key={server}>
          <div>{server}</div>
          <button onClick={() => removeServer(server)}>Remove</button>
        </div>
      ))}
      <input ref={serverField}></input>
      <button onClick={addServerFromInput}>Add Server</button>
    </div>
  );
};
