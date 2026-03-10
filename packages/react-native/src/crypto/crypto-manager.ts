export const KEY_TYPE = {
  ED25519: 1,
} as const;

export interface ICryptoManager {
  generateKeyPair(
    keyType: number
  ): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }>;
  derivePublicKey(privateKey: Uint8Array, keyType: number): Promise<Uint8Array>;
  sign(
    privateKey: Uint8Array,
    message: Uint8Array,
    keyType: number
  ): Promise<Uint8Array>;
  verify(
    publicKey: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array,
    keyType: number
  ): Promise<boolean>;
  generateProcessId(): Promise<Uint8Array>;
  getSupportedKeyTypes(): number[];
  toHex(data: Uint8Array): string;
}
