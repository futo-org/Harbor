import { createContext } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import wasmUrl from '@polycentric/rs-core-wasm-browser/polycentric_core_bg.wasm';
import {
  IndexedDBStorageDriver,
  BrowserCryptoManager,
  BrowserWasmBridge,
} from '@polycentric/js-browser';
import { HydrationStrategy, PolycentricClient } from '@polycentric/js-core';
import { currentSelectedIdentity } from './utils/identities.ts';
import { HydrationStatus } from '@polycentric/js-core';

export const ClientContext = createContext<PolycentricClient | null>(null);

try {
  console.log('1. Starting client initialization...');

  const storageDriver = await IndexedDBStorageDriver.create('test');
  console.log('2. Storage driver created');

  const cryptoManager = new BrowserCryptoManager();
  console.log('3. Crypto manager created');

  const coreBridge = new BrowserWasmBridge(wasmUrl);
  console.log('4. WASM bridge created');

  const clientInstance = await PolycentricClient.create({
    storageDriver,
    cryptoManager,
    coreBridge,
    hydration: {
      strategy: HydrationStrategy.FULL_ASYNC,
      batchSize: 100,
    },
  });

  clientInstance.events.onHydrationStatus(async (status) => {
    if (status === HydrationStatus.COMPLETED) {
      console.log('Hydration complete, syncing...');
      await clientInstance.sync();
      console.log('Sync complete.');
    }
  });

  console.log('5. PolycentricClient created successfully');

  console.log('6. Loading identities...');
  const identities = await clientInstance.getAllIdentities();

  console.log('7. Identities loaded', identities);

  let keyPair;
  if (identities.length > 0) {
    keyPair = await clientInstance.switchIdentity(
      currentSelectedIdentity(identities).publicKey,
    );
    console.log('8. Identity loaded', keyPair);
  }

  createRoot(document.getElementById('root')!).render(
    <ClientContext.Provider value={clientInstance}>
      <App />
    </ClientContext.Provider>,
  );
} catch (error) {
  alert('Unable to initialize client');
  console.error(error);
}
