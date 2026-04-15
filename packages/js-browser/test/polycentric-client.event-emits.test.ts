import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KEY_TYPE, PolycentricClient } from '@polycentric/js-core';
import { ClientState, InitializationStep } from '@polycentric/js-core';
import type { PolycentricClientConfig, Identity } from '@polycentric/js-core';
import wasmUrl from '@polycentric/rs-core-wasm-browser/polycentric_core_bg.wasm';
import {
  BrowserWasmBridge,
  SqlStorageDriver,
  BrowserCryptoManager,
  OPFSSQLiteDatabase,
} from '@polycentric/js-browser/full';

describe('PolycentricClient EventService', () => {
  const TEST_DB_NAME = 'test-db-event-service';

  beforeEach(async () => {
    try {
      await OPFSSQLiteDatabase.deleteDatabase(TEST_DB_NAME);
    } catch {
      // ignore cleanup errors
    }
  });

  afterEach(async () => {
    try {
      await OPFSSQLiteDatabase.deleteDatabase(TEST_DB_NAME);
    } catch {
      // ignore cleanup errors
    }
  });

  it('should have correct initial state after creation', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME),
      cryptoManager: new BrowserCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);

    // Verify final state after initialization
    expect(client.state).toBe(ClientState.READY);
    expect(client.isReady).toBe(true);
    expect(client.error).toBeNull();
    expect(client.step).toBe(InitializationStep.COMPLETE);
  });

  it('should emit progress events during initialization', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME),
      cryptoManager: new BrowserCryptoManager(),
    };

    const progressSteps: InitializationStep[] = [];

    const client = await PolycentricClient.create(clientConfig);

    client.events.onProgress((step: InitializationStep) => {
      progressSteps.push(step);
    });

    // Trigger a progress event
    client.events.emitProgress(InitializationStep.HYDRATING_EVENTS);

    expect(progressSteps).toContain(InitializationStep.HYDRATING_EVENTS);
  });

  it('should emit identity change events when creating identity', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME),
      cryptoManager: new BrowserCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);

    let identityChanged = false;
    let newIdentity: Identity | null = null;

    client.events.onIdentityChanged((identity: Identity | null) => {
      identityChanged = true;
      newIdentity = identity;
    });

    const keyPair = await client.createIdentity({ keyType: KEY_TYPE.ED25519 });

    expect(identityChanged).toBe(true);
    expect(newIdentity).toBeDefined();
    expect(newIdentity!.keyPair).toEqual(keyPair);
    expect(newIdentity!.process).toEqual(client.process);
  });

  it('should emit identity change events when switching identity', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME),
      cryptoManager: new BrowserCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);

    const keyPair1 = await client.createIdentity({
      keyType: KEY_TYPE.ED25519,
      setAsCurrent: false,
    });
    await client.createIdentity({
      keyType: KEY_TYPE.ED25519,
      setAsCurrent: false,
    });

    let identityChanged = false;
    let switchedIdentity: Identity | null = null;

    client.events.onIdentityChanged((identity: Identity | null) => {
      identityChanged = true;
      switchedIdentity = identity;
    });

    await client.switchKeyPair(keyPair1.publicKey);

    expect(identityChanged).toBe(true);
    expect(switchedIdentity).toBeDefined();
    expect(switchedIdentity!.keyPair).toEqual(keyPair1);
  });

  it('should emit state change events', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME),
      cryptoManager: new BrowserCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);

    let stateChanged = false;
    let emittedState: ClientState | null = null;

    client.events.onStateChanged((state: ClientState) => {
      stateChanged = true;
      emittedState = state;
    });

    // Trigger a state change
    client.events.emitStateChanged(ClientState.INITIALIZING);

    expect(stateChanged).toBe(true);
    expect(emittedState).toBe(ClientState.INITIALIZING);
  });

  it('should emit error events', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME),
      cryptoManager: new BrowserCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);

    let stateChanged = false;
    let emittedState: ClientState | null = null;

    client.events.onStateChanged((state: ClientState) => {
      stateChanged = true;
      emittedState = state;
    });

    // Trigger a state change
    client.events.emitStateChanged(ClientState.INITIALIZING);

    expect(stateChanged).toBe(true);
    expect(emittedState).toBe(ClientState.INITIALIZING);
  });

  it('should emit error events', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME),
      cryptoManager: new BrowserCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);

    let errorEmitted = false;
    let emittedError: Error | null = null;

    client.events.onError((error: Error) => {
      errorEmitted = true;
      emittedError = error;
    });

    const testError = new Error('Test error');
    client.events.emitError(testError);

    expect(errorEmitted).toBe(true);
    expect(emittedError).toBe(testError);
  });

  it('should track current identity state', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME),
      cryptoManager: new BrowserCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);

    // Initially no identity
    // expect(client.currentIdentity).toBeNull();
    // expect(() => client.currentKeyPair).toThrow();

    // Create identity
    const keyPair = await client.createIdentity({ keyType: KEY_TYPE.ED25519 });

    expect(client.currentIdentity).toBeDefined();
    expect(client.currentIdentity.keyPair).toEqual(keyPair);
    expect(client.currentIdentity.process).toEqual(client.process);
  });

  it('should emit multiple events in sequence', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME),
      cryptoManager: new BrowserCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);

    const events: string[] = [];

    client.events.onStateChanged(() => events.push('stateChanged'));
    client.events.onProgress(() => events.push('progress'));
    client.events.onIdentityChanged(() => events.push('identityChanged'));
    client.events.onError(() => events.push('error'));

    // Trigger multiple events
    client.events.emitProgress(InitializationStep.STARTING);
    await client.createIdentity({ keyType: KEY_TYPE.ED25519 });
    client.events.emitError(new Error('Test'));

    expect(events).toContain('progress');
    expect(events).toContain('identityChanged');
    expect(events).toContain('error');
  });

  it('should handle multiple listeners for the same event', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME),
      cryptoManager: new BrowserCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);

    let listener1Called = false;
    let listener2Called = false;

    client.events.onIdentityChanged(() => {
      listener1Called = true;
    });

    client.events.onIdentityChanged(() => {
      listener2Called = true;
    });

    await client.createIdentity({ keyType: KEY_TYPE.ED25519 });

    expect(listener1Called).toBe(true);
    expect(listener2Called).toBe(true);
  });

  it('should allow removing listeners', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME),
      cryptoManager: new BrowserCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);

    let listenerCalled = false;
    const listener = () => {
      listenerCalled = true;
    };

    client.events.onIdentityChanged(listener);
    client.events.offIdentityChanged(listener);

    await client.createIdentity({ keyType: KEY_TYPE.ED25519 });

    expect(listenerCalled).toBe(false);
  });

  it('should allow removing all listeners', async () => {
    const clientConfig: PolycentricClientConfig = {
      coreBridge: new BrowserWasmBridge(wasmUrl),
      storageDriver: await SqlStorageDriver.create(TEST_DB_NAME),
      cryptoManager: new BrowserCryptoManager(),
    };

    const client = await PolycentricClient.create(clientConfig);

    let listenerCalled = false;
    client.events.onIdentityChanged(() => {
      listenerCalled = true;
    });

    client.events.removeAllListeners();

    await client.createIdentity({ keyType: KEY_TYPE.ED25519 });

    expect(listenerCalled).toBe(false);
  });
});
