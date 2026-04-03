import { KEY_TYPE, type KeyPair, type IdentityState } from '@polycentric/js-core';
import { useCallback, useContext, useEffect, useState } from 'react';
import { keyPairsAreEqual } from '../../utils/misc';
import { Identifier } from '../../utils/identities';
import { ClientContext } from '../../main';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

export const IdentitySelector = () => {
  const client = useContext(ClientContext);

  const [inputEnabled, setInputEnabled] = useState(true);
  const [identities, setIdentities] = useState<KeyPair[]>([]);
  const [identityState, setIdentityState] = useState<IdentityState>({ identity: null, authorizedKeys: [], eventLog: [] });
  const [claimIdHex, setClaimIdHex] = useState('');
  const [issueKeyHex, setIssueKeyHex] = useState('');
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
    ? toHex(identityState.identity.id.value)
    : null;

  const mono = { fontFamily: 'monospace', fontSize: '0.78rem', wordBreak: 'break-all' as const };

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
      {identityIdHex ? (
        <div style={{ marginBottom: 10 }}>
          <span className="badge badge-valid" style={{ marginRight: 6 }}>identity</span>
          <div style={{ ...mono, color: '#d2a8ff', marginTop: 4 }}>
            {identityIdHex}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 10, fontSize: '0.8rem', color: '#484f58' }}>
          No identity created yet
        </div>
      )}

      {/* ── Authorized keys ──────────────────────────── */}
      {identityState.authorizedKeys?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '0.78rem', color: '#484f58', marginBottom: 4 }}>
            Authorized keys
          </div>
          {identityState.authorizedKeys.map((ak, i) => (
            <div key={i} style={{ marginBottom: 6, padding: '6px 8px', background: '#0d1117', borderRadius: 4, border: '1px solid #21262d' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ color: '#3fb950', fontSize: '0.72rem' }}>
                  permissions: {ak.permissions.join(', ')}
                </span>
                <span className={`badge ${ak.claimed ? 'badge-valid' : 'badge-invalid'}`}>
                  {ak.claimed ? 'claimed' : 'pending'}
                </span>
              </div>
              <div style={{ ...mono, color: '#8b949e' }}>
                {toHex(ak.key)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Event log ────────────────────────────────── */}
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
                claim: '#58a6ff',
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
                  <div style={{ ...mono, color: '#8b949e', marginLeft: 14 }}>
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

      {/* ── Issue Identity ───────────────────────────── */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: '0.78rem', color: '#484f58', marginBottom: 4 }}>
          Issue identity to another key
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={issueKeyHex}
            onChange={(e) => setIssueKeyHex(e.target.value)}
            placeholder="Target public key (hex)"
            style={{ flex: 1, ...mono }}
          />
          <button
            onClick={async () => {
              if (!issueKeyHex.trim()) return;
              setInputEnabled(false);
              setStatus('Issuing identity...');
              try {
                const keyBytes = new Uint8Array(
                  issueKeyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
                );
                await client.issueIdentity(keyBytes);
                await loadIdentities();
                setIssueKeyHex('');
                setStatus('Identity issued');
              } catch (error) {
                setStatus(`Issue failed: ${error}`);
              }
              setInputEnabled(true);
            }}
            disabled={!inputEnabled || !issueKeyHex.trim() || !identityIdHex}
          >
            Issue
          </button>
        </div>
      </div>

      {/* ── Claim Identity ───────────────────────────── */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: '0.78rem', color: '#484f58', marginBottom: 4 }}>
          Claim an identity issued to this key
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={claimIdHex}
            onChange={(e) => setClaimIdHex(e.target.value)}
            placeholder="Identity ID (hex) to claim"
            style={{ flex: 1, ...mono }}
          />
          <button
            onClick={async () => {
              if (!claimIdHex.trim()) return;
              setInputEnabled(false);
              setStatus('Claiming identity...');
              try {
                const idBytes = new Uint8Array(
                  claimIdHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
                );
                await client.claimIdentity(idBytes);
                await loadIdentities();
                setClaimIdHex('');
                setStatus('Identity claimed');
              } catch (error) {
                setStatus(`Claim failed: ${error}`);
              }
              setInputEnabled(true);
            }}
            disabled={!inputEnabled || !claimIdHex.trim()}
          >
            Claim
          </button>
        </div>
      </div>

      {/* ── Status ───────────────────────────────────── */}
      {status && (
        <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#8b949e' }}>
          {status}
        </div>
      )}

      {/* ── Other key pairs ──────────────────────────── */}
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
