import type { KeyPair, PolycentricClient } from '../polycentric-client';
import { KeyType, PrivateKey, PublicKey } from '../proto/v2';

export class LoginManager {
  constructor(private readonly client: PolycentricClient) {}

  async generateKeyPair(keyType?: KeyType): Promise<KeyPair> {
    if (!keyType) {
      keyType = KeyType.ED25519;
    }

    const { privateKey: privateKeyRaw, publicKey: publicKeyRaw } =
      await this.client.crypto.generateKeyPair(keyType);

    const privateKey = PrivateKey.create({
      keyType,
      key: privateKeyRaw,
    });
    const publicKey = PublicKey.create({
      keyType,
      key: publicKeyRaw,
    });

    return { privateKey, publicKey, keyType };
  }
}
