import { useToast } from '@/src/common/components/toast';
import { confirm } from '@/src/common/lib/dialogs/alert';
import {
  DEFAULT_SEED_SERVERS,
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { invalidateAllQueries } from '@/src/common/query/hooks/useQuery';
import { ServerAlreadyAddedError } from '@polycentric/react-native';
import { useState } from 'react';

export function useServerSettings() {
  const client = usePolycentric();
  const { identity } = useCurrentIdentity();
  const toast = useToast();

  // Servers come from the identity document; identities that have never
  // configured a list fall back to the client's default servers. An
  // explicitly empty list stays empty.
  const servers = identity?.servers ?? client.servers;
  const suggestedServers = DEFAULT_SEED_SERVERS.filter(
    (server) => !servers.includes(server),
  );

  const [isBusy, setIsBusy] = useState(false);
  const [addError, setAddError] = useState<Error | null>(null);

  const addServer = async (url: string) => {
    if (!url || isBusy) return false;
    setIsBusy(true);
    setAddError(null);
    try {
      await client.identityManager.addServer(url);
      invalidateAllQueries(client);
      toast.success('Server added');
      return true;
    } catch (err) {
      if (err instanceof ServerAlreadyAddedError) {
        toast.info('Server already added');
        return false;
      }
      console.error('Failed to add server:', err);
      toast.error('Could not add server');
      setAddError(err instanceof Error ? err : new Error(String(err)));
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const removeServer = async (server: string) => {
    const ok = await confirm({
      title: 'Remove Server',
      message: `Remove ${server}?`,
      confirmText: 'Remove',
    });
    if (!ok) return;
    setIsBusy(true);
    try {
      await client.identityManager.removeServer(server);
      invalidateAllQueries(client);
      toast.success('Server removed');
    } catch (err) {
      console.error('Failed to remove server:', err);
      toast.error(
        err instanceof Error ? err.message : 'Could not remove server',
      );
    } finally {
      setIsBusy(false);
    }
  };

  return {
    servers,
    suggestedServers,
    isBusy,
    addError,
    addServer,
    removeServer,
  };
}
