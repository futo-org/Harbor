import { KEY_TYPE, type KeyPair } from '@polycentric/js-core';
import { useCallback, useContext, useEffect, useState } from 'react';
import { keyPairsAreEqual } from '../../utils/misc';
import { Identifier } from '../../utils/identities';
import { ClientContext } from '../../main';

export const IdentitySelector = () => {
  const client = useContext(ClientContext);

  const [inputEnabled, setInputEnabled] = useState(true);
  const [identities, setIdentities] = useState<KeyPair[]>([]);

  const loadIdentities = useCallback(async () => {
    if (!client) return;
    setIdentities(await client.getKeys());
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

  return (
    <div className="card">
      <h3>Key Pair</h3>

      <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#58a6ff', wordBreak: 'break-all', marginBottom: 10 }}>
        {currentIdentifier}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={async () => {
            setInputEnabled(false);
            await client.createKeyPair({ keyType: KEY_TYPE.ED25519 });
            await loadIdentities();
            setInputEnabled(true);
          }}
          disabled={!inputEnabled}
        >
          New
        </button>
        <button
          onClick={async () => {
            setInputEnabled(false);
            await client.rotateKeyPair();
            await loadIdentities();
            setInputEnabled(true);
          }}
          disabled={!inputEnabled}
        >
          Rotate
        </button>
      </div>

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
