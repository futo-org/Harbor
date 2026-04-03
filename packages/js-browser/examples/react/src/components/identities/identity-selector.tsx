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

  const [inputEnabled, setInputEnabled] = useState<boolean>(true);
  const [uiState, setUIState] = useState<UIState>(UIState.Select);
  const [identities, setIdentities] = useState<KeyPair[]>([]);

  const submitButton = useRef<HTMLButtonElement | null>(null);
  const usernameField = useRef<HTMLInputElement | null>(null);
  const passwordField = useRef<HTMLInputElement | null>(null);
  const exportLink = useRef<HTMLAnchorElement | null>(null);

  const loadIdentities = useCallback(async () => {
    if (client === null) return;
    setIdentities(await client.getKeys());
  }, [client]);

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  if (client === null) return <div>Error: No client object provided</div>;

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
      <div>
        <button onClick={() => setUIState(UIState.Select)}>Back</button>
        <div>Please select your backup file</div>
        <form onSubmit={(e) => e.preventDefault()}>
          <input
            type="file"
            onChange={async (e) => {
              const element = e.target as HTMLInputElement;
              if (
                !element.files ||
                element.files.length < 1 ||
                !passwordField.current
              )
                return;

              passwordField.current.value = await element.files[0].text();
            }}
          ></input>
          <input type="password" ref={passwordField}></input>
          <button type="submit" disabled={!inputEnabled} onClick={handleLogin}>
            Log in
          </button>
        </form>
      </div>
    );
  }

  if (uiState === UIState.Signup) {
    const handleSignup = async () => {
      if (usernameField.current === null) return;

      const identity = await client.createKeyPair({
        keyType: KEY_TYPE.ED25519,
      });
      //await client.createUsername(usernameField.current.value);
      await loadIdentities();

      if (submitButton.current !== null && passwordField.current !== null) {
        passwordField.current.value = Base64.fromUint8Array(
          PrivateKey.toBinary(identity.privateKey),
        );
        submitButton.current.click();
      }

      setUIState(UIState.Select);

      setInputEnabled(true);
    };

    return (
      <div>
        <div>What's your username?</div>
        <form onSubmit={(e) => e.preventDefault()}>
          <input ref={usernameField}></input>
          <input type="password" hidden ref={passwordField}></input>
          <button ref={submitButton} hidden></button>
        </form>
        <button onClick={handleSignup} disabled={!inputEnabled}>
          Create account
        </button>
      </div>
    );
  }

  const currentUsername =
    /* client.queryUsername(client.currentIdentity.keyPair.publicKey) || */ '';
  const currentIdentifier =
    client.currentKeyPair && Identifier(client.currentKeyPair.publicKey);

  return (
    <div>
      <div>
        <button onClick={() => setUIState(UIState.Signup)}>Sign up</button>
        <button onClick={() => setUIState(UIState.Login)}>Log in</button>
      </div>

      <div>
        <div>{currentUsername}</div>
        <div>{currentIdentifier}</div>
        <button
          onClick={async () => {
            setInputEnabled(false);

            const toRemove = client.currentIdentity.keyPair.publicKey;

            if (otherIdentities.length > 0) {
              await client.switchKeyPair(otherIdentities[0].publicKey);
            } else {
              await client.createKeyPair({
                keyType: KEY_TYPE.ED25519,
                setAsCurrent: true,
                ephemeral: true,
              });
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
          onClick={async () => {
            if (exportLink.current === null) return;
            const link = exportLink.current;
            const filename = `${currentUsername}_${currentIdentifier}.pca`;

            const keyBlob = new Blob([
              Base64.fromUint8Array(
                PrivateKey.toBinary(client.currentIdentity.keyPair.privateKey),
              ),
            ]);
            const url = URL.createObjectURL(keyBlob);

            link.href = url;
            link.download = filename;

            link.click();

            link.href = '';
            URL.revokeObjectURL(url);
          }}
        >
          Export
        </button>
        <a hidden ref={exportLink}>
          Hidden anchor that is needed to make downloads work
        </a>
      </div>

      <div>
        {otherIdentities.map((identity) => (
          <div key={Identifier(identity.publicKey)}>
            <div>{/*client.queryUsername(identity.publicKey) || ""*/}</div>
            <div>{Identifier(identity.publicKey)}</div>
            <button
              onClick={async () => {
                setInputEnabled(false);
                await selectIdentity(client, identity.publicKey);
                setInputEnabled(true);
              }}
              disabled={!inputEnabled}
            >
              Switch to
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
