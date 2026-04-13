import { createContext } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import wasmUrl from '@polycentric/rs-core-wasm-browser/polycentric_core_bg.wasm?url';
import {
  IndexedDBStorageDriver,
  BrowserCryptoManager,
  BrowserWasmBridge,
} from '@polycentric/js-browser';
import { PolycentricClient } from '@polycentric/js-core';

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
  });

  console.log('5. PolycentricClient created successfully');

  console.log('6. Loading keys...');
  const keys = await clientInstance.keyPairManager.getKeys();

  console.log('7. Keys loaded', keys);

  createRoot(document.getElementById('root')!).render(
    <ClientContext.Provider value={clientInstance}>
      <App />
    </ClientContext.Provider>,
  );
} catch (error) {
  alert('Unable to initialize client');
  console.error(error);
}
