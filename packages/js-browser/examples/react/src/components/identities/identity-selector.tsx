import {
  KEY_TYPE,
  PublicKey,
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

const fromHex = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return new Uint8Array(
    clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
  );
};

export const IdentitySelector = () => {
  const client = useContext(ClientContext);

  const [inputEnabled, setInputEnabled] = useState(true);
  const [identities, setIdentities] = useState<KeyPair[]>([]);
  const [identityState, setIdentityState] = useState<IdentityState>({
    identityKey: null,
    rotationKeys: [],
    signingKeys: [],
  });
  const [issueKeyHex, setIssueKeyHex] = useState('');
  const [claimIdentityKeyHex, setClaimIdentityKeyHex] = useState('');
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span className="badge badge-valid">identity</span>
            <button
              onClick={async () => {
                client.setActiveIdentityKey(null);
                await loadIdentities();
                setStatus('Disconnected from identity');
              }}
              disabled={!inputEnabled}
              style={{ padding: '2px 8px', fontSize: '0.72rem' }}
            >
              Disconnect
            </button>
          </div>
          <div style={{ ...mono, color: '#d2a8ff' }}>
            {identityState.identityKey}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 10, fontSize: '0.8rem', color: '#484f58' }}>
          No active identity
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
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
                marginBottom: 4,
                padding: '4px 8px',
                background: '#0d1117',
                borderRadius: 4,
                border: '1px solid #21262d',
              }}
            >
              <div style={{ ...mono, color: '#3fb950' }}>{toHex(pk.key)}</div>
              <button
                onClick={async () => {
                  if (!identityState.identityKey) return;
                  setInputEnabled(false);
                  setStatus('Removing signing key...');
                  try {
                    await client.removeSigningKey(identityState.identityKey, pk);
                    await loadIdentities();
                    setStatus('Signing key removed');
                  } catch (error) {
                    setStatus(`Failed: ${error}`);
                  }
                  setInputEnabled(true);
                }}
                disabled={!inputEnabled}
                style={{ padding: '2px 8px', fontSize: '0.72rem' }}
              >
                Revoke
              </button>
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

      {/* ── Issue Signing Key ────────────────────────── */}
      {identityState.identityKey && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: '0.78rem', color: '#484f58', marginBottom: 4 }}>
            Issue signing key to another public key
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
                if (!issueKeyHex.trim() || !identityState.identityKey) return;
                setInputEnabled(false);
                setStatus('Issuing signing key...');
                try {
                  const keyBytes = fromHex(issueKeyHex.trim());
                  const targetKey = PublicKey.create({
                    keyType: KEY_TYPE.ED25519,
                    key: keyBytes,
                  });
                  await client.addSigningKey(identityState.identityKey, targetKey);
                  await loadIdentities();
                  setIssueKeyHex('');
                  setStatus('Signing key issued');
                } catch (error) {
                  setStatus(`Issue failed: ${error}`);
                }
                setInputEnabled(true);
              }}
              disabled={!inputEnabled || !issueKeyHex.trim()}
            >
              Issue
            </button>
          </div>
        </div>
      )}

      {/* ── Claim Identity ──────────────────────────── */}
      {!identityState.identityKey && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: '0.78rem', color: '#484f58', marginBottom: 4 }}>
            Claim an identity (pull from server by identity key)
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={claimIdentityKeyHex}
              onChange={(e) => setClaimIdentityKeyHex(e.target.value)}
              placeholder="Identity key (hex hash)"
              style={{ flex: 1, ...mono }}
            />
            <button
              onClick={async () => {
                if (!claimIdentityKeyHex.trim()) return;
                setInputEnabled(false);
                setStatus('Claiming identity...');
                try {
                  await client.claimIdentity(claimIdentityKeyHex.trim());
                  await loadIdentities();
                  setClaimIdentityKeyHex('');
                  setStatus('Identity claimed');
                } catch (error) {
                  setStatus(`Claim failed: ${error}`);
                }
                setInputEnabled(true);
              }}
              disabled={!inputEnabled || !claimIdentityKeyHex.trim()}
            >
              Claim
            </button>
          </div>
        </div>
      )}

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
