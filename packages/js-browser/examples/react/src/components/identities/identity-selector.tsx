import { KEY_TYPE, PrivateKey, type KeyPair } from '@polycentric/js-core';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { keyPairsAreEqual } from '../../utils/misc';
import { Identifier, selectIdentity } from '../../utils/identities';
import { ClientContext } from '../../main';
import { Base64 } from 'js-base64';

enum UIState {
  Select,
  Login,
  Signup,
}

export const IdentitySelector = () => {
  const client = useContext(ClientContext);

  const [inputEnabled, setInputEnabled] = useState(true);
  const [uiState, setUIState] = useState(UIState.Select);
  const [identities, setIdentities] = useState<KeyPair[]>([]);

  const passwordField = useRef<HTMLInputElement | null>(null);
  const exportLink = useRef<HTMLAnchorElement | null>(null);

  const loadIdentities = useCallback(async () => {
    if (!client) return;
    setIdentities(await client.getKeys());
  }, [client]);

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  if (!client) return null;

  const otherIdentities = identities.filter(
    (identity) => !keyPairsAreEqual(identity, client.currentKeyPair!),
  );

  if (uiState === UIState.Login) {
    const handleLogin = async () => {
      if (!passwordField.current) return;
      setInputEnabled(false);
      try {
        const key = PrivateKey.fromBinary(
          Base64.toUint8Array(passwordField.current.value),
        );
        await client.importIdentity(key);
        await loadIdentities();
        setUIState(UIState.Select);
      } catch {
        alert('Bad identity string');
      }
      setInputEnabled(true);
    };

    return (
      <div className="card">
        <h3>Import Identity</h3>
        <input
          type="file"
          onChange={async (e) => {
            const el = e.target as HTMLInputElement;
            if (!el.files?.length || !passwordField.current) return;
            passwordField.current.value = await el.files[0].text();
          }}
          style={{ marginBottom: 8 }}
        />
        <input type="password" ref={passwordField} placeholder="Paste key or use file" />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={handleLogin} disabled={!inputEnabled}>
            Import
          </button>
          <button onClick={() => setUIState(UIState.Select)}>Cancel</button>
        </div>
      </div>
    );
  }

  if (uiState === UIState.Signup) {
    const handleSignup = async () => {
      setInputEnabled(false);
      await client.createKeyPair({ keyType: KEY_TYPE.ED25519 });
      await loadIdentities();
      setUIState(UIState.Select);
      setInputEnabled(true);
    };

    return (
      <div className="card">
        <h3>Create Identity</h3>
        <button onClick={handleSignup} disabled={!inputEnabled}>
          Generate new key pair
        </button>
        <button onClick={() => setUIState(UIState.Select)} style={{ marginLeft: 8 }}>
          Cancel
        </button>
      </div>
    );
  }

  const currentIdentifier =
    client.currentKeyPair && Identifier(client.currentKeyPair.publicKey);

  return (
    <div className="card">
      <h3>Identity</h3>

      <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#58a6ff', wordBreak: 'break-all', marginBottom: 10 }}>
        {currentIdentifier}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setUIState(UIState.Signup)}>New</button>
        <button onClick={() => setUIState(UIState.Login)}>Import</button>
        <button
          onClick={async () => {
            setInputEnabled(false);
            const toRemove = client.currentKeyPair!.publicKey;
            if (otherIdentities.length > 0) {
              await client.switchKeyPair(otherIdentities[0].publicKey);
            } else {
              await client.createKeyPair({ keyType: KEY_TYPE.ED25519, setAsCurrent: true });
            }
            await client.removeKeyPair(toRemove);
            await loadIdentities();
            setInputEnabled(true);
          }}
          disabled={!inputEnabled}
        >
          Remove
        </button>
        <button
          onClick={() => {
            if (!exportLink.current) return;
            const link = exportLink.current;
            const keyBlob = new Blob([
              Base64.fromUint8Array(
                PrivateKey.toBinary(client.currentKeyPair!.privateKey),
              ),
            ]);
            const url = URL.createObjectURL(keyBlob);
            link.href = url;
            link.download = `${currentIdentifier}.pca`;
            link.click();
            link.href = '';
            URL.revokeObjectURL(url);
          }}
        >
          Export
        </button>
        <a hidden ref={exportLink} />
      </div>

      {otherIdentities.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid #21262d', paddingTop: 8 }}>
          <div style={{ fontSize: '0.78rem', color: '#484f58', marginBottom: 4 }}>
            Other identities
          </div>
          {otherIdentities.map((identity) => (
            <div
              key={Identifier(identity.publicKey)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#8b949e' }}>
                {Identifier(identity.publicKey)}
              </span>
              <button
                onClick={async () => {
                  setInputEnabled(false);
                  await selectIdentity(client, identity.publicKey);
                  setInputEnabled(true);
                }}
                disabled={!inputEnabled}
                style={{ padding: '2px 10px', fontSize: '0.78rem' }}
              >
                Switch
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
