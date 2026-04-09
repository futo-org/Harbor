import {
  KEY_TYPE,
  type KeyPair,
  type IdentityState,
} from '@polycentric/js-core';
import { useCallback, useContext, useEffect, useState } from 'react';
import { keyPairsAreEqual } from '../../utils/misc';
import { Identifier } from '../../utils/identities';
import { ClientContext } from '../../main';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export const IdentitySelector = () => {
  const client = useContext(ClientContext);

  const [inputEnabled, setInputEnabled] = useState(true);
  const [identities, setIdentities] = useState<KeyPair[]>([]);
  const [identityState, setIdentityState] = useState<IdentityState>({
    identityKey: null,
    rotationKeys: [],
    signingKeys: [],
  });
  const [status, setStatus] = useState('');

  const loadIdentities = useCallback(async () => {
    if (!client) return;
    setIdentities(await client.getKeys());
    setIdentityState(await client.getCurrentIdentity());
  }, [client]);

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  if (!client) return null;

  const otherIdentities = identities.filter(
    (identity) =>
      client.currentKeyPair &&
      !keyPairsAreEqual(identity, client.currentKeyPair),
  );

  const currentIdentifier =
    client.currentKeyPair && Identifier(client.currentKeyPair.publicKey);

  const mono = {
    fontFamily: 'monospace',
    fontSize: '0.78rem',
    wordBreak: 'break-all' as const,
  };

  return (
    <div className="card">
      <h3>Key Pair</h3>

      <div style={{ ...mono, color: '#58a6ff', marginBottom: 2 }}>
        {currentIdentifier}
      </div>
      {client.currentKeyPair && (
        <div style={{ ...mono, color: '#8b949e', marginBottom: 6 }}>
          {toHex(client.currentKeyPair.publicKey.key)}
        </div>
      )}

      {/* ── Identity ─────────────────────────────────── */}
      {identityState.identityKey ? (
        <div style={{ marginBottom: 10 }}>
          <span className="badge badge-valid" style={{ marginRight: 6 }}>
            identity
          </span>
          <div style={{ ...mono, color: '#d2a8ff', marginTop: 4 }}>
            {identityState.identityKey}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 10, fontSize: '0.8rem', color: '#484f58' }}>
          No identity created yet
        </div>
      )}

      {/* ── Rotation keys ────────────────────────────── */}
      {identityState.rotationKeys.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '0.78rem', color: '#484f58', marginBottom: 4 }}>
            Rotation keys
          </div>
          {identityState.rotationKeys.map((pk, i) => (
            <div key={i} style={{ ...mono, color: '#f0883e', marginBottom: 2 }}>
              {toHex(pk.key)}
            </div>
          ))}
        </div>
      )}

      {/* ── Signing keys ─────────────────────────────── */}
      {identityState.signingKeys.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '0.78rem', color: '#484f58', marginBottom: 4 }}>
            Signing keys
          </div>
          {identityState.signingKeys.map((pk, i) => (
            <div key={i} style={{ ...mono, color: '#3fb950', marginBottom: 2 }}>
              {toHex(pk.key)}
            </div>
          ))}
        </div>
      )}

      {/* ── Actions ──────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={async () => {
            setInputEnabled(false);
            await client.createKeyPair({ keyType: KEY_TYPE.ED25519 });
            await loadIdentities();
            setStatus('');
            setInputEnabled(true);
          }}
          disabled={!inputEnabled}
        >
          New Key Pair
        </button>
        <button
          onClick={async () => {
            setInputEnabled(false);
            await client.rotateKeyPair();
            await loadIdentities();
            setStatus('');
            setInputEnabled(true);
          }}
          disabled={!inputEnabled}
        >
          Rotate
        </button>
        <button
          onClick={async () => {
            setInputEnabled(false);
            setStatus('Creating identity...');
            try {
              const currentKey = client.currentKeyPair!.publicKey;
              await client.publishIdentity(null, [currentKey], []);
              await loadIdentities();
              setStatus('Identity created');
            } catch (error) {
              setStatus(`Failed: ${error}`);
            }
            setInputEnabled(true);
          }}
          disabled={!inputEnabled}
        >
          Create Identity
        </button>
      </div>

      {/* ── Status ───────────────────────────────────── */}
      {status && (
        <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#8b949e' }}>
          {status}
        </div>
      )}

      {/* ── Other key pairs ──────────────────────────── */}
      {otherIdentities.length > 0 && (
        <div
          style={{
            marginTop: 12,
            borderTop: '1px solid #21262d',
            paddingTop: 8,
          }}
        >
          <div
            style={{ fontSize: '0.78rem', color: '#484f58', marginBottom: 4 }}
          >
            Other key pairs
          </div>
          {otherIdentities.map((kp) => (
            <div
              key={Identifier(kp.publicKey)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 0',
              }}
            >
              <span style={{ ...mono, color: '#8b949e' }}>
                {Identifier(kp.publicKey)}
              </span>
              <button
                onClick={async () => {
                  setInputEnabled(false);
                  await client.switchKeyPair(kp.publicKey);
                  await loadIdentities();
                  setStatus('');
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
