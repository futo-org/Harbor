const hexStringToBytes = (hexString: string): Uint8Array => {
  return Uint8Array.from(
    hexString.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
  );
};

export const mockEd25519PrivateKey1 =
  "B95507E6D1CF5E29953F7C0E8B58E28E96FABC5D85DDAD0849D7537F5E297482";
export const mockEd25519PrivateKeyBytes1 = hexStringToBytes(
  mockEd25519PrivateKey1,
);
export const mockEd25519PublicKey1 =
  "558F29FE069D87205555E22C844C9BB39E4A80A22AA46260D09C6B6E9B229774";
export const mockEd25519PublicKeyBytes1 = hexStringToBytes(
  mockEd25519PublicKey1,
);

export const mockEd25519PrivateKey2 =
  "E89C489EC3195AEDEB3F20EEA97B66256B3BCD64780AA9EC5A81C228336F5254";
export const mockEd25519PrivateKeyBytes2 = hexStringToBytes(
  mockEd25519PrivateKey2,
);
export const mockEd25519PublicKey2 =
  "6B8999C9387108BFABF9EEC9DE77A0BE7FD466A68C2011675EB817F07FBAA366";
export const mockEd25519PublicKeyBytes2 = hexStringToBytes(
  mockEd25519PublicKey2,
);

export const mockEd25519PrivateKey3 =
  "B06BF816DEB3F507C68B131DDF43F5F94992E2FF21AB5541EDE2E6BDD3B5FBA3";
export const mockEd25519PrivateKeyBytes3 = hexStringToBytes(
  mockEd25519PrivateKey3,
);

export const mockEd25519PublicKey3 =
  "31FFEBD5C299F23AF4595E71432AE94923A0FEDBCE3ECA1894424FAD3F60C79E";
export const mockEd25519PublicKeyBytes3 = hexStringToBytes(
  mockEd25519PublicKey3,
);
