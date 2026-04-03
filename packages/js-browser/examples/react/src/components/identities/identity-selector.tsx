import { KEY_TYPE, type KeyPair, type IdentityState } from '@polycentric/js-core';
import { useCallback, useContext, useEffect, useState } from 'react';
import { keyPairsAreEqual } from '../../utils/misc';
import { Identifier } from '../../utils/identities';
import { ClientContext } from '../../main';

export const IdentitySelector = () => {
  const client = useContext(ClientContext);

  const [inputEnabled, setInputEnabled] = useState(true);
  const [identities, setIdentities] = useState<KeyPair[]>([]);
  const [identityState, setIdentityState] = useState<IdentityState>({ identity: null, authorizedKeys: [] });
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
    (identity) => client.currentKeyPair && !keyPairsAreEqual(identity, client.currentKeyPair),
  );

  const currentIdentifier =
    client.currentKeyPair && Identifier(client.currentKeyPair.publicKey);

  const identityIdHex = identityState.identity?.id?.value
    ? Array.from(identityState.identity.id.value.slice(0, 16))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    : null;

  const toHex = (bytes: Uint8Array, len = 8) =>
    Array.from(bytes.slice(0, len)).map((b) => b.toString(16).padStart(2, '0')).join('');

  return (
    <div className="card">
      <h3>Key Pair</h3>

      <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#58a6ff', wordBreak: 'break-all', marginBottom: 6 }}>
        {currentIdentifier}
      </div>

      {identityIdHex ? (
        <div style={{ marginBottom: 10 }}>
          <span className="badge badge-valid" style={{ marginRight: 6 }}>identity</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#d2a8ff' }}>
            {identityIdHex}...
          </span>
        </div>
      ) : (
        <div style={{ marginBottom: 10, fontSize: '0.8rem', color: '#484f58' }}>
          No identity created yet
        </div>
      )}

      {identityState.authorizedKeys?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '0.78rem', color: '#484f58', marginBottom: 4 }}>
            Authorized keys
          </div>
          {identityState.authorizedKeys.map((ak, i) => (
            <div key={i} style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#8b949e', padding: '2px 0' }}>
              {toHex(ak.key)}... <span style={{ color: '#3fb950' }}>({ak.permissions.join(', ')})</span>
            </div>
          ))}
        </div>
      )}

      {identityState.eventLog?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '0.78rem', color: '#484f58', marginBottom: 6 }}>
            Identity event log
          </div>
          <div style={{ borderLeft: '2px solid #30363d', paddingLeft: 12 }}>
            {identityState.eventLog.map((entry, i) => {
              const typeColors: Record<string, string> = {
                identity: '#f0883e',
                issue: '#3fb950',
                revoke: '#f85149',
                unknown: '#484f58',
              };
              const color = typeColors[entry.type] ?? '#484f58';

              return (
                <div key={i} style={{ marginBottom: 8, fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      backgroundColor: entry.signatureValid ? '#3fb950' : '#f85149',
                      display: 'inline-block', flexShrink: 0,
                    }} />
                    <span style={{ color, fontWeight: 600 }}>
                      #{entry.sequence.toString()} {entry.type.toUpperCase()}
                    </span>
                    <span className={`badge ${entry.signatureValid ? 'badge-valid' : 'badge-invalid'}`}>
                      {entry.signatureValid ? 'sig ok' : 'sig fail'}
                    </span>
                  </div>
                  <div style={{ color: '#8b949e', fontFamily: 'monospace', marginLeft: 14 }}>
                    {entry.detail}
                  </div>
                  <div style={{ color: '#484f58', fontSize: '0.72rem', marginLeft: 14 }}>
                    {entry.createdAt ? new Date(Number(entry.createdAt)).toLocaleString() : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              await client.createIdentity();
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

      {status && (
        <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#8b949e' }}>
          {status}
        </div>
      )}

      {otherIdentities.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid #21262d', paddingTop: 8 }}>
          <div style={{ fontSize: '0.78rem', color: '#484f58', marginBottom: 4 }}>
            Other key pairs
          </div>
          {otherIdentities.map((kp) => (
            <div
              key={Identifier(kp.publicKey)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#8b949e' }}>
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
