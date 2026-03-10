import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ClientContext } from "../../main";


export const ServerSelector = () => {
  const client = useContext(ClientContext);

  const [servers, setServers] = useState<string[]>([]);
  const serverField = useRef<HTMLInputElement | null>(null);

  const loadIdentities = useCallback(async () => {
    if (client === null) return;
    setServers(await client.queryServers(client.currentIdentity.keyPair.publicKey));
  }, [client]);

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  if (client === null) return <div>Error: No client object provided</div>;

  const addServer = async (server: string) => {
    await client.createAddServer(server);
    loadIdentities();
  }

  const removeServer = async (server: string) => {
    await client.createRemoveServer(server);
    loadIdentities();
  }

  const addServerFromInput = () => {
    if(!serverField.current) return;

    addServer(serverField.current.value);
  }

  return <div>
    {servers.map((server) => (
    <div key={server}>
      <div>{server}</div>
      <button onClick={() => removeServer(server)}>Remove</button>
    </div>
    ))}
    <input ref={serverField}></input>
    <button onClick={addServerFromInput}>Add Server</button>
  </div>
};
