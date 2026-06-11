import {
  bytesEqual,
  bytesToHex,
  v2,
  type IKeyPairManager,
  type PersistedKey,
  type PolycentricClient,
  type UnlockedKey,
} from '@polycentric/js-core';

/**
 * Fixed PRF salt for the polycentric secure-keys credential. Same input
 * yields the same PRF output for the same WebAuthn credential, so a
 * persisted ciphertext can be decrypted by re-prompting the user.
 * If this changes, the credential-derived wrapping key will also change.
 */
const PRF_SALT = new TextEncoder().encode(
  'polycentric:secure-keys:prf-salt:v1',
);

/**
 * HKDF stands for HMAC-based Key Derivation Function
 * HKDF `info` label binding the derived key to this exact use.
 * If this changes, the credential-derived wrapping key will also change.
 */
const HKDF_INFO = new TextEncoder().encode(
  'polycentric:secure-keys:wrap-key:v1',
);

/**
 * Manage keypairs in IndexedDB.
 * Private keys can be stored as plaintext or ciphertext.
 * Ciphertext is encrypted with a wrapping key derived from a WebAuthn credential.
 * https://contributing.bitwarden.com/architecture/deep-dives/passkeys/implementations/relying-party/prf/
 */
export class BrowserKeyPairManager implements IKeyPairManager {
  constructor(private readonly client: PolycentricClient) {}
  async isProtectedAvailable(): Promise<boolean> {
    try {
      // https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredential/getClientCapabilities_static
      const caps = await window.PublicKeyCredential.getClientCapabilities();

      return caps['extension:prf'] === true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a new key pair.
   * Store it as plaintext if `protected` is false,
   * otherwise use a wrapping key to encrypt the private key.
   * The returned UnlockedKey always carries the in-hand plaintext bytes
   * so callers can sign without a follow-up auth prompt.
   */
  async generate(
    keyType: v2.KeyType,
    opts?: { protected?: boolean; strict?: boolean },
  ): Promise<UnlockedKey> {
    const { privateKey, publicKey } =
      await this.client.cryptoManager.generateKeyPair(keyType);

    if (opts?.protected) {
      if (await this.isProtectedAvailable()) {
        let protectedKey:
          | { persistedKey: PersistedKey; wrappingKey: CryptoKey }
          | undefined;
        try {
          // Protected, encrypt the private key under a WebAuthn-derived wrapping key.
          protectedKey = await this.encryptPrivateKey(
            keyType,
            publicKey,
            privateKey,
          );
        } catch (err) {
          if (opts.strict) throw err;
        }

        if (protectedKey) {
          await this.client.storage.keys.insert(protectedKey.persistedKey);
          return {
            persistedKey: protectedKey.persistedKey,
            isProtected: true,
            unlockedPrivateKey: privateKey,
          };
        }
      } else if (opts.strict) {
        throw new Error(
          'BrowserKeyPairManager: WebAuthn protected storage is unavailable',
        );
      }
    }

    const persistedKey: PersistedKey = {
      public_key: publicKey,
      key_type: keyType,
      private_key: privateKey,
    };
    await this.client.storage.keys.insert(persistedKey);
    return {
      persistedKey,
      isProtected: false,
      unlockedPrivateKey: privateKey,
    };
  }

  /**
   * Move a locally-held key into or out of protected (encrypted) storage,
   * re-persisting it. Decrypting / encrypting prompts for user verification.
   */
  async setProtected(publicKey: v2.PublicKey, protect: boolean): Promise<void> {
    const row = await this.client.storage.keys.get(publicKey);
    if (!row) {
      throw new Error(
        'Unknown public key in BrowserKeyPairManager.setProtected',
      );
    }

    if (protect) {
      if (!row.private_key) return; // already protected
      const { persistedKey } = await this.encryptPrivateKey(
        row.key_type,
        row.public_key,
        row.private_key,
      );
      await this.client.storage.keys.insert(persistedKey);
      return;
    }

    if (row.private_key) return; // already plaintext
    if (!row.encrypted_private_key || !row.credential_id) {
      throw new Error('Protected row missing ciphertext or credential_id');
    }
    const { wrappingKey } = await this.obtainWrappingKey([row.credential_id]);
    const { iv, ciphertext } = unpackCiphertext(row.encrypted_private_key);
    const privateKey = await aesGcmDecrypt(
      wrappingKey,
      iv,
      ciphertext,
      row.public_key,
    );
    await this.client.storage.keys.insert({
      public_key: row.public_key,
      key_type: row.key_type,
      private_key: privateKey,
    });
  }

  /**
   * Encrypt `privateKey` under a WebAuthn-derived wrapping key (reusing an
   * enrolled credential or creating one), returning the `PersistedKey` to
   * store plus the wrapping key for any chained operations.
   */
  private async encryptPrivateKey(
    keyType: v2.KeyType,
    publicKey: Uint8Array,
    privateKey: Uint8Array,
  ): Promise<{ persistedKey: PersistedKey; wrappingKey: CryptoKey }> {
    const enrolled = await this.collectEnrolledCredentialIds();
    let credentialId: Uint8Array;
    let wrappingKey: CryptoKey;
    let credentialLabel: string | undefined;
    if (enrolled.length > 0) {
      // The user already has at least one webauthn credential
      const got = await this.obtainWrappingKey(enrolled); // User verification prompt
      credentialId = got.credentialId;
      wrappingKey = got.wrappingKey;
      // Carry the label already recorded for this credential, if any.
      credentialLabel = await this.labelForCredential(credentialId);
    } else {
      // No existing credentials, we need to create a new one
      const created = await this.createCredential(); // User verification prompt
      credentialId = created.credentialId;
      credentialLabel = created.label;
      wrappingKey = created.prfOutput
        ? await this.deriveWrappingKey(created.prfOutput) // No user verification prompt
        : (await this.obtainWrappingKey([credentialId])).wrappingKey; // User verification prompt
    }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await aesGcmEncrypt(
      wrappingKey,
      iv,
      privateKey,
      publicKey,
    );
    const persistedKey: PersistedKey = {
      public_key: publicKey,
      key_type: keyType,
      encrypted_private_key: packCiphertext(iv, ciphertext),
      credential_id: credentialId,
      credential_label: credentialLabel,
    };
    return { persistedKey, wrappingKey };
  }

  /**
   * The label (passkey `user.name`) recorded for a credential id, looked up
   * from any stored key that already uses it. Undefined if none recorded.
   */
  private async labelForCredential(
    credentialId: Uint8Array,
  ): Promise<string | undefined> {
    const all = await this.client.storage.keys.getAllKeys();
    const match = all.find(
      (k) =>
        k.credential_id &&
        bytesEqual(k.credential_id, credentialId) &&
        k.credential_label,
    );
    return match?.credential_label;
  }

  /**
   * Polycentric protocol signature.
   * The public key is a rotation key or signing key of a polycentric identity.
   */
  async sign(bytes: Uint8Array, signer: v2.PublicKey): Promise<Uint8Array> {
    const row = await this.client.storage.keys.get(signer);
    if (!row) {
      throw new Error('Unknown public key in BrowserKeyPairManager.sign');
    }

    if (row.private_key) {
      // The private key is stored as plaintext, so we can sign directly
      return this.client.cryptoManager.sign(
        row.private_key,
        bytes,
        row.key_type,
      );
    }

    if (!row.encrypted_private_key || !row.credential_id) {
      throw new Error('Protected row missing ciphertext or credential_id');
    }
    // Try to decrypt the private key using the wrapping key
    const { wrappingKey } = await this.obtainWrappingKey([row.credential_id]);
    const { iv, ciphertext } = unpackCiphertext(row.encrypted_private_key);
    const privateKey = await aesGcmDecrypt(
      wrappingKey,
      iv,
      ciphertext,
      signer.key,
    );
    return this.client.cryptoManager.sign(privateKey, bytes, row.key_type);
  }

  async unlock(publicKey: v2.PublicKey): Promise<UnlockedKey | null> {
    const row = await this.client.storage.keys.get(publicKey);
    if (!row) return null;
    if (row.private_key) {
      return {
        persistedKey: row,
        isProtected: false,
        unlockedPrivateKey: row.private_key,
      };
    }
    if (!row.encrypted_private_key || !row.credential_id) {
      throw new Error('Protected row missing ciphertext or credential_id');
    }
    const { wrappingKey } = await this.obtainWrappingKey([row.credential_id]);
    const { iv, ciphertext } = unpackCiphertext(row.encrypted_private_key);
    const privateKey = await aesGcmDecrypt(
      wrappingKey,
      iv,
      ciphertext,
      row.public_key,
    );
    return {
      persistedKey: row,
      isProtected: true,
      unlockedPrivateKey: privateKey,
    };
  }

  async delete(publicKey: v2.PublicKey): Promise<void> {
    await this.client.storage.keys.delete(publicKey);
  }

  /**
   * Distinct credential ids referenced by any persisted protected key.
   * The browser's chooser handles selection when more than one is allowed.
   */
  private async collectEnrolledCredentialIds(): Promise<Uint8Array[]> {
    const all = await this.client.storage.keys.getAllKeys();
    const out: Uint8Array[] = [];
    for (const row of all) {
      if (!row.credential_id) continue;
      if (out.some((id) => bytesEqual(id, row.credential_id!))) continue;
      out.push(row.credential_id);
    }
    return out;
  }

  /**
   * Obtain the wrapping key by running a WebAuthn assertion (`get`) that
   * evaluates the PRF extension, then deriving an AES-GCM key from it.
   * Returns the credential id the platform actually used alongside the
   * wrapping key. Always prompts the user.
   */
  private async obtainWrappingKey(
    allowedCredentialIds: Uint8Array[],
  ): Promise<{ credentialId: Uint8Array; wrappingKey: CryptoKey }> {
    let assertion: PublicKeyCredential | null;
    try {
      assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: allowedCredentialIds.map((id) => ({
            id: detachedBuffer(id),
            type: 'public-key',
            transports: ['internal', 'usb', 'nfc', 'ble', 'hybrid'],
          })),
          userVerification: 'required',
          extensions: {
            prf: { eval: { first: PRF_SALT } },
          } as unknown as object,
        },
      })) as PublicKeyCredential | null;
    } catch (err) {
      throw toAuthError(err);
    }
    if (!assertion) {
      throw new Error('WebAuthn assertion cancelled or failed');
    }
    const credentialId = new Uint8Array(assertion.rawId);
    if (!allowedCredentialIds.some((id) => bytesEqual(id, credentialId))) {
      throw new Error('Authenticator returned a credential not allowed');
    }
    const ext = assertion.getClientExtensionResults() as {
      // As of 2026, PRF is still relatively new.
      // This `prf` can be found in the response but not in the return type
      prf?: { results?: { first?: ArrayBuffer } };
    };
    const prfResult = ext.prf?.results?.first;
    if (!prfResult) {
      throw new Error('WebAuthn PRF extension unavailable on this device');
    }
    const wrappingKey = await this.deriveWrappingKey(new Uint8Array(prfResult));
    return { credentialId, wrappingKey };
  }

  /**
   * Derive the AES-GCM wrapping key from raw PRF output bytes.
   */
  private async deriveWrappingKey(prfBytes: Uint8Array): Promise<CryptoKey> {
    const hkdfKey = await crypto.subtle.importKey(
      'raw',
      detachedBuffer(prfBytes),
      'HKDF',
      false,
      ['deriveKey'],
    );
    return await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(0),
        info: detachedBuffer(HKDF_INFO),
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  /**
   * Enroll a new WebAuthn credential.
   * return PRF output if available to avoid an extra webauthn user prompt.
   */
  private async createCredential(): Promise<{
    credentialId: Uint8Array;
    prfOutput: Uint8Array | null;
    label: string;
  }> {
    // A unique, identifiable label shown as the passkey's user name in OS
    // password managers (and surfaced in-app), so abandoned passkeys can be
    // matched. `user.name` is the field managers reliably display.
    const label = `px_${bytesToHex(crypto.getRandomValues(new Uint8Array(16)))}`;
    // https://w3c.github.io/webauthn/#prf-extension
    // https://caniuse.com/mdn-api_credentialscontainer_create_publickey_option_extensions_prf
    let credential: PublicKeyCredential | null;
    try {
      credential = (await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)), // typically a server-generated random value
          rp: { name: 'Polycentric' },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)), // typically a stable account identifier
            name: label, // shown as the "user name" in OS password managers
            displayName: label,
          },
          pubKeyCredParams: [
            // We don't care much about the algorithm here.
            // We just need any credential so we can use
            // the PRF extension to derive a wrapping key.
            // https://www.iana.org/assignments/cose/cose.xhtml#algorithms
            { alg: -7, type: 'public-key' }, // ES256: macOS web, Windows 11 web, YubiKey
            { alg: -8, type: 'public-key' }, // EdDSA (Ed25519): more niche / specific platforms and versions
            { alg: -257, type: 'public-key' }, // RS256: more niche / specific platforms and versions
          ],
          authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required',
          },
          extensions: {
            prf: { eval: { first: PRF_SALT } },
          } as unknown as object,
        },
      })) as PublicKeyCredential | null;
    } catch (err) {
      throw toAuthError(err);
    }
    if (!credential) {
      throw new Error('WebAuthn credential creation cancelled or failed');
    }

    const ext = credential.getClientExtensionResults() as {
      prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
    };
    if (!(ext.prf?.enabled || ext.prf?.results?.first)) {
      throw new Error('Authenticator does not support PRF extension');
    }

    const credentialId = new Uint8Array(credential.rawId);
    const prfOutput = ext.prf?.results?.first
      ? new Uint8Array(ext.prf.results.first)
      : null;
    return { credentialId, prfOutput, label };
  }
}

/**
 * Map a raw WebAuthn rejection to a user-readable error. A cancelled or
 * timed-out prompt surfaces as a `NotAllowedError`/`AbortError` DOMException
 * whose default message is opaque; everything else is passed through.
 */
function toAuthError(err: unknown): Error {
  if (
    err instanceof DOMException &&
    (err.name === 'NotAllowedError' || err.name === 'AbortError')
  ) {
    return new Error('Authentication was cancelled or timed out.');
  }
  return err instanceof Error ? err : new Error(String(err));
}

function detachedBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}

/**
 * Pack the IV and ciphertext into a single Uint8Array for storage
 */
function packCiphertext(iv: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, iv.length);
  return out;
}

/**
 * Unpack the IV and ciphertext for decryption
 */
function unpackCiphertext(blob: Uint8Array): {
  iv: Uint8Array;
  ciphertext: Uint8Array;
} {
  return {
    iv: blob.subarray(0, 12),
    ciphertext: blob.subarray(12),
  };
}

/**
 * Use wrapping key to encrypt
 */
async function aesGcmEncrypt(
  wrappingKey: CryptoKey,
  iv: Uint8Array,
  plaintext: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array> {
  const ct = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: detachedBuffer(iv),
      additionalData: detachedBuffer(additionalData),
    },
    wrappingKey,
    detachedBuffer(plaintext),
  );
  return new Uint8Array(ct);
}

/**
 * Use wrapping key to decrypt
 */
async function aesGcmDecrypt(
  wrappingKey: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: detachedBuffer(iv),
      additionalData: detachedBuffer(additionalData),
    },
    wrappingKey,
    detachedBuffer(ciphertext),
  );
  return new Uint8Array(pt);
}
