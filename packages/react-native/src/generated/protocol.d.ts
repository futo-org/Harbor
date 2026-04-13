import * as $protobuf from 'protobufjs';
import Long = require('long');
/** Namespace polycentric. */
export namespace polycentric {
  /** ContentType enum. */
  enum ContentType {
    UNKNOWN = 0,
    DELETE = 1,
    SYSTEM_PROCESSES = 2,
    POST = 3,
    FOLLOW = 4,
    USERNAME = 5,
    DESCRIPTION = 6,
    BLOB_META = 7,
    BLOB_SECTION = 8,
    AVATAR = 9,
    SERVER = 10,
    VOUCH = 11,
    CLAIM = 12,
    BANNER = 13,
    OPINION = 14,
    STORE = 15,
    AUTHORITY = 16,
    JOIN_TOPIC = 17,
    BLOCK = 18,
  }

  /** Opinion enum. */
  enum Opinion {
    UNSPECIFIED = 0,
    LIKE = 1,
    DISLIKE = 2,
    NEUTRAL = 3,
  }

  /** Properties of a PublicKey. */
  interface IPublicKey {
    /** PublicKey keyType */
    keyType?: number | Long | null;

    /** PublicKey key */
    key?: Uint8Array | null;
  }

  /** Represents a PublicKey. */
  class PublicKey implements IPublicKey {
    /**
     * Constructs a new PublicKey.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IPublicKey);

    /** PublicKey keyType. */
    public keyType: number | Long;

    /** PublicKey key. */
    public key: Uint8Array;

    /**
     * Creates a new PublicKey instance using the specified properties.
     * @param [properties] Properties to set
     * @returns PublicKey instance
     */
    public static create(
      properties?: polycentric.IPublicKey
    ): polycentric.PublicKey;

    /**
     * Encodes the specified PublicKey message. Does not implicitly {@link polycentric.PublicKey.verify|verify} messages.
     * @param message PublicKey message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IPublicKey,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified PublicKey message, length delimited. Does not implicitly {@link polycentric.PublicKey.verify|verify} messages.
     * @param message PublicKey message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IPublicKey,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a PublicKey message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns PublicKey
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.PublicKey;

    /**
     * Decodes a PublicKey message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns PublicKey
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.PublicKey;

    /**
     * Verifies a PublicKey message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a PublicKey message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns PublicKey
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.PublicKey;

    /**
     * Creates a plain object from a PublicKey message. Also converts values to other types if specified.
     * @param message PublicKey
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.PublicKey,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this PublicKey to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for PublicKey
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a PrivateKey. */
  interface IPrivateKey {
    /** PrivateKey keyType */
    keyType?: number | Long | null;

    /** PrivateKey key */
    key?: Uint8Array | null;
  }

  /** Represents a PrivateKey. */
  class PrivateKey implements IPrivateKey {
    /**
     * Constructs a new PrivateKey.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IPrivateKey);

    /** PrivateKey keyType. */
    public keyType: number | Long;

    /** PrivateKey key. */
    public key: Uint8Array;

    /**
     * Creates a new PrivateKey instance using the specified properties.
     * @param [properties] Properties to set
     * @returns PrivateKey instance
     */
    public static create(
      properties?: polycentric.IPrivateKey
    ): polycentric.PrivateKey;

    /**
     * Encodes the specified PrivateKey message. Does not implicitly {@link polycentric.PrivateKey.verify|verify} messages.
     * @param message PrivateKey message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IPrivateKey,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified PrivateKey message, length delimited. Does not implicitly {@link polycentric.PrivateKey.verify|verify} messages.
     * @param message PrivateKey message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IPrivateKey,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a PrivateKey message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns PrivateKey
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.PrivateKey;

    /**
     * Decodes a PrivateKey message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns PrivateKey
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.PrivateKey;

    /**
     * Verifies a PrivateKey message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a PrivateKey message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns PrivateKey
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.PrivateKey;

    /**
     * Creates a plain object from a PrivateKey message. Also converts values to other types if specified.
     * @param message PrivateKey
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.PrivateKey,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this PrivateKey to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for PrivateKey
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a VectorClock. */
  interface IVectorClock {
    /** VectorClock logicalClocks */
    logicalClocks?: (number | Long)[] | null;
  }

  /** Represents a VectorClock. */
  class VectorClock implements IVectorClock {
    /**
     * Constructs a new VectorClock.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IVectorClock);

    /** VectorClock logicalClocks. */
    public logicalClocks: (number | Long)[];

    /**
     * Creates a new VectorClock instance using the specified properties.
     * @param [properties] Properties to set
     * @returns VectorClock instance
     */
    public static create(
      properties?: polycentric.IVectorClock
    ): polycentric.VectorClock;

    /**
     * Encodes the specified VectorClock message. Does not implicitly {@link polycentric.VectorClock.verify|verify} messages.
     * @param message VectorClock message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IVectorClock,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified VectorClock message, length delimited. Does not implicitly {@link polycentric.VectorClock.verify|verify} messages.
     * @param message VectorClock message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IVectorClock,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a VectorClock message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns VectorClock
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.VectorClock;

    /**
     * Decodes a VectorClock message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns VectorClock
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.VectorClock;

    /**
     * Verifies a VectorClock message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a VectorClock message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns VectorClock
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.VectorClock;

    /**
     * Creates a plain object from a VectorClock message. Also converts values to other types if specified.
     * @param message VectorClock
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.VectorClock,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this VectorClock to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for VectorClock
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of an Index. */
  interface IIndex {
    /** Index indexType */
    indexType?: number | Long | null;

    /** Index logicalClock */
    logicalClock?: number | Long | null;
  }

  /** Represents an Index. */
  class Index implements IIndex {
    /**
     * Constructs a new Index.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IIndex);

    /** Index indexType. */
    public indexType: number | Long;

    /** Index logicalClock. */
    public logicalClock: number | Long;

    /**
     * Creates a new Index instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Index instance
     */
    public static create(properties?: polycentric.IIndex): polycentric.Index;

    /**
     * Encodes the specified Index message. Does not implicitly {@link polycentric.Index.verify|verify} messages.
     * @param message Index message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IIndex,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Index message, length delimited. Does not implicitly {@link polycentric.Index.verify|verify} messages.
     * @param message Index message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IIndex,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an Index message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Index
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.Index;

    /**
     * Decodes an Index message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Index
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.Index;

    /**
     * Verifies an Index message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an Index message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Index
     */
    public static fromObject(object: { [k: string]: any }): polycentric.Index;

    /**
     * Creates a plain object from an Index message. Also converts values to other types if specified.
     * @param message Index
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.Index,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Index to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Index
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of an Indices. */
  interface IIndices {
    /** Indices indices */
    indices?: polycentric.IIndex[] | null;
  }

  /** Represents an Indices. */
  class Indices implements IIndices {
    /**
     * Constructs a new Indices.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IIndices);

    /** Indices indices. */
    public indices: polycentric.IIndex[];

    /**
     * Creates a new Indices instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Indices instance
     */
    public static create(
      properties?: polycentric.IIndices
    ): polycentric.Indices;

    /**
     * Encodes the specified Indices message. Does not implicitly {@link polycentric.Indices.verify|verify} messages.
     * @param message Indices message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IIndices,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Indices message, length delimited. Does not implicitly {@link polycentric.Indices.verify|verify} messages.
     * @param message Indices message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IIndices,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an Indices message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Indices
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.Indices;

    /**
     * Decodes an Indices message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Indices
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.Indices;

    /**
     * Verifies an Indices message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an Indices message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Indices
     */
    public static fromObject(object: { [k: string]: any }): polycentric.Indices;

    /**
     * Creates a plain object from an Indices message. Also converts values to other types if specified.
     * @param message Indices
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.Indices,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Indices to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Indices
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a Process. */
  interface IProcess {
    /** Process process */
    process?: Uint8Array | null;
  }

  /** Represents a Process. */
  class Process implements IProcess {
    /**
     * Constructs a new Process.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IProcess);

    /** Process process. */
    public process: Uint8Array;

    /**
     * Creates a new Process instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Process instance
     */
    public static create(
      properties?: polycentric.IProcess
    ): polycentric.Process;

    /**
     * Encodes the specified Process message. Does not implicitly {@link polycentric.Process.verify|verify} messages.
     * @param message Process message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IProcess,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Process message, length delimited. Does not implicitly {@link polycentric.Process.verify|verify} messages.
     * @param message Process message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IProcess,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a Process message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Process
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.Process;

    /**
     * Decodes a Process message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Process
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.Process;

    /**
     * Verifies a Process message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a Process message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Process
     */
    public static fromObject(object: { [k: string]: any }): polycentric.Process;

    /**
     * Creates a plain object from a Process message. Also converts values to other types if specified.
     * @param message Process
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.Process,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Process to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Process
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a Digest. */
  interface IDigest {
    /** Digest digestType */
    digestType?: number | Long | null;

    /** Digest digest */
    digest?: Uint8Array | null;
  }

  /** Represents a Digest. */
  class Digest implements IDigest {
    /**
     * Constructs a new Digest.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IDigest);

    /** Digest digestType. */
    public digestType: number | Long;

    /** Digest digest. */
    public digest: Uint8Array;

    /**
     * Creates a new Digest instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Digest instance
     */
    public static create(properties?: polycentric.IDigest): polycentric.Digest;

    /**
     * Encodes the specified Digest message. Does not implicitly {@link polycentric.Digest.verify|verify} messages.
     * @param message Digest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IDigest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Digest message, length delimited. Does not implicitly {@link polycentric.Digest.verify|verify} messages.
     * @param message Digest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IDigest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a Digest message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Digest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.Digest;

    /**
     * Decodes a Digest message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Digest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.Digest;

    /**
     * Verifies a Digest message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a Digest message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Digest
     */
    public static fromObject(object: { [k: string]: any }): polycentric.Digest;

    /**
     * Creates a plain object from a Digest message. Also converts values to other types if specified.
     * @param message Digest
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.Digest,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Digest to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Digest
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  namespace Digest {
    /** DigestType enum. */
    enum DigestType {
      Unknown = 0,
      SHA256 = 1,
    }
  }

  /** Properties of a Pointer. */
  interface IPointer {
    /** Pointer system */
    system?: polycentric.IPublicKey | null;

    /** Pointer process */
    process?: polycentric.IProcess | null;

    /** Pointer logicalClock */
    logicalClock?: number | Long | null;

    /** Pointer eventDigest */
    eventDigest?: polycentric.IDigest | null;
  }

  /** Represents a Pointer. */
  class Pointer implements IPointer {
    /**
     * Constructs a new Pointer.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IPointer);

    /** Pointer system. */
    public system?: polycentric.IPublicKey | null;

    /** Pointer process. */
    public process?: polycentric.IProcess | null;

    /** Pointer logicalClock. */
    public logicalClock: number | Long;

    /** Pointer eventDigest. */
    public eventDigest?: polycentric.IDigest | null;

    /**
     * Creates a new Pointer instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Pointer instance
     */
    public static create(
      properties?: polycentric.IPointer
    ): polycentric.Pointer;

    /**
     * Encodes the specified Pointer message. Does not implicitly {@link polycentric.Pointer.verify|verify} messages.
     * @param message Pointer message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IPointer,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Pointer message, length delimited. Does not implicitly {@link polycentric.Pointer.verify|verify} messages.
     * @param message Pointer message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IPointer,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a Pointer message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Pointer
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.Pointer;

    /**
     * Decodes a Pointer message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Pointer
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.Pointer;

    /**
     * Verifies a Pointer message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a Pointer message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Pointer
     */
    public static fromObject(object: { [k: string]: any }): polycentric.Pointer;

    /**
     * Creates a plain object from a Pointer message. Also converts values to other types if specified.
     * @param message Pointer
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.Pointer,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Pointer to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Pointer
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a LWWElementSet. */
  interface ILWWElementSet {
    /** LWWElementSet operation */
    operation?: polycentric.LWWElementSet.Operation | null;

    /** LWWElementSet value */
    value?: Uint8Array | null;

    /** LWWElementSet unixMilliseconds */
    unixMilliseconds?: number | Long | null;
  }

  /** Represents a LWWElementSet. */
  class LWWElementSet implements ILWWElementSet {
    /**
     * Constructs a new LWWElementSet.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.ILWWElementSet);

    /** LWWElementSet operation. */
    public operation: polycentric.LWWElementSet.Operation;

    /** LWWElementSet value. */
    public value: Uint8Array;

    /** LWWElementSet unixMilliseconds. */
    public unixMilliseconds: number | Long;

    /**
     * Creates a new LWWElementSet instance using the specified properties.
     * @param [properties] Properties to set
     * @returns LWWElementSet instance
     */
    public static create(
      properties?: polycentric.ILWWElementSet
    ): polycentric.LWWElementSet;

    /**
     * Encodes the specified LWWElementSet message. Does not implicitly {@link polycentric.LWWElementSet.verify|verify} messages.
     * @param message LWWElementSet message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.ILWWElementSet,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified LWWElementSet message, length delimited. Does not implicitly {@link polycentric.LWWElementSet.verify|verify} messages.
     * @param message LWWElementSet message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.ILWWElementSet,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a LWWElementSet message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns LWWElementSet
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.LWWElementSet;

    /**
     * Decodes a LWWElementSet message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns LWWElementSet
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.LWWElementSet;

    /**
     * Verifies a LWWElementSet message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a LWWElementSet message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns LWWElementSet
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.LWWElementSet;

    /**
     * Creates a plain object from a LWWElementSet message. Also converts values to other types if specified.
     * @param message LWWElementSet
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.LWWElementSet,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this LWWElementSet to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for LWWElementSet
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  namespace LWWElementSet {
    /** Operation enum. */
    enum Operation {
      ADD = 0,
      REMOVE = 1,
    }
  }

  /** Properties of a LWWElement. */
  interface ILWWElement {
    /** LWWElement value */
    value?: Uint8Array | null;

    /** LWWElement unixMilliseconds */
    unixMilliseconds?: number | Long | null;
  }

  /** Represents a LWWElement. */
  class LWWElement implements ILWWElement {
    /**
     * Constructs a new LWWElement.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.ILWWElement);

    /** LWWElement value. */
    public value: Uint8Array;

    /** LWWElement unixMilliseconds. */
    public unixMilliseconds: number | Long;

    /**
     * Creates a new LWWElement instance using the specified properties.
     * @param [properties] Properties to set
     * @returns LWWElement instance
     */
    public static create(
      properties?: polycentric.ILWWElement
    ): polycentric.LWWElement;

    /**
     * Encodes the specified LWWElement message. Does not implicitly {@link polycentric.LWWElement.verify|verify} messages.
     * @param message LWWElement message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.ILWWElement,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified LWWElement message, length delimited. Does not implicitly {@link polycentric.LWWElement.verify|verify} messages.
     * @param message LWWElement message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.ILWWElement,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a LWWElement message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns LWWElement
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.LWWElement;

    /**
     * Decodes a LWWElement message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns LWWElement
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.LWWElement;

    /**
     * Verifies a LWWElement message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a LWWElement message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns LWWElement
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.LWWElement;

    /**
     * Creates a plain object from a LWWElement message. Also converts values to other types if specified.
     * @param message LWWElement
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.LWWElement,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this LWWElement to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for LWWElement
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a Reference. */
  interface IReference {
    /** Reference referenceType */
    referenceType?: number | Long | null;

    /** Reference reference */
    reference?: Uint8Array | null;
  }

  /** Represents a Reference. */
  class Reference implements IReference {
    /**
     * Constructs a new Reference.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IReference);

    /** Reference referenceType. */
    public referenceType: number | Long;

    /** Reference reference. */
    public reference: Uint8Array;

    /**
     * Creates a new Reference instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Reference instance
     */
    public static create(
      properties?: polycentric.IReference
    ): polycentric.Reference;

    /**
     * Encodes the specified Reference message. Does not implicitly {@link polycentric.Reference.verify|verify} messages.
     * @param message Reference message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IReference,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Reference message, length delimited. Does not implicitly {@link polycentric.Reference.verify|verify} messages.
     * @param message Reference message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IReference,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a Reference message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Reference
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.Reference;

    /**
     * Decodes a Reference message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Reference
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.Reference;

    /**
     * Verifies a Reference message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a Reference message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Reference
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.Reference;

    /**
     * Creates a plain object from a Reference message. Also converts values to other types if specified.
     * @param message Reference
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.Reference,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Reference to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Reference
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  namespace Reference {
    /** ReferenceType enum. */
    enum ReferenceType {
      Unknown = 0,
      System = 1,
      Pointer = 2,
      Bytes = 3,
    }
  }

  /** Properties of a ProcessSecret. */
  interface IProcessSecret {
    /** ProcessSecret system */
    system?: polycentric.IPrivateKey | null;

    /** ProcessSecret process */
    process?: polycentric.IProcess | null;
  }

  /** Represents a ProcessSecret. */
  class ProcessSecret implements IProcessSecret {
    /**
     * Constructs a new ProcessSecret.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IProcessSecret);

    /** ProcessSecret system. */
    public system?: polycentric.IPrivateKey | null;

    /** ProcessSecret process. */
    public process?: polycentric.IProcess | null;

    /**
     * Creates a new ProcessSecret instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ProcessSecret instance
     */
    public static create(
      properties?: polycentric.IProcessSecret
    ): polycentric.ProcessSecret;

    /**
     * Encodes the specified ProcessSecret message. Does not implicitly {@link polycentric.ProcessSecret.verify|verify} messages.
     * @param message ProcessSecret message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IProcessSecret,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ProcessSecret message, length delimited. Does not implicitly {@link polycentric.ProcessSecret.verify|verify} messages.
     * @param message ProcessSecret message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IProcessSecret,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a ProcessSecret message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ProcessSecret
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.ProcessSecret;

    /**
     * Decodes a ProcessSecret message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ProcessSecret
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.ProcessSecret;

    /**
     * Verifies a ProcessSecret message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a ProcessSecret message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ProcessSecret
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.ProcessSecret;

    /**
     * Creates a plain object from a ProcessSecret message. Also converts values to other types if specified.
     * @param message ProcessSecret
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.ProcessSecret,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ProcessSecret to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ProcessSecret
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a ModerationTag. */
  interface IModerationTag {
    /** ModerationTag name */
    name?: string | null;

    /** ModerationTag level */
    level?: number | null;
  }

  /** Represents a ModerationTag. */
  class ModerationTag implements IModerationTag {
    /**
     * Constructs a new ModerationTag.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IModerationTag);

    /** ModerationTag name. */
    public name: string;

    /** ModerationTag level. */
    public level: number;

    /**
     * Creates a new ModerationTag instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ModerationTag instance
     */
    public static create(
      properties?: polycentric.IModerationTag
    ): polycentric.ModerationTag;

    /**
     * Encodes the specified ModerationTag message. Does not implicitly {@link polycentric.ModerationTag.verify|verify} messages.
     * @param message ModerationTag message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IModerationTag,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ModerationTag message, length delimited. Does not implicitly {@link polycentric.ModerationTag.verify|verify} messages.
     * @param message ModerationTag message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IModerationTag,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a ModerationTag message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ModerationTag
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.ModerationTag;

    /**
     * Decodes a ModerationTag message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ModerationTag
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.ModerationTag;

    /**
     * Verifies a ModerationTag message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a ModerationTag message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ModerationTag
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.ModerationTag;

    /**
     * Creates a plain object from a ModerationTag message. Also converts values to other types if specified.
     * @param message ModerationTag
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.ModerationTag,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ModerationTag to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ModerationTag
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a SignedEvent. */
  interface ISignedEvent {
    /** SignedEvent signature */
    signature?: Uint8Array | null;

    /** SignedEvent event */
    event?: Uint8Array | null;

    /** SignedEvent moderationTags */
    moderationTags?: polycentric.IModerationTag[] | null;
  }

  /** Represents a SignedEvent. */
  class SignedEvent implements ISignedEvent {
    /**
     * Constructs a new SignedEvent.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.ISignedEvent);

    /** SignedEvent signature. */
    public signature: Uint8Array;

    /** SignedEvent event. */
    public event: Uint8Array;

    /** SignedEvent moderationTags. */
    public moderationTags: polycentric.IModerationTag[];

    /**
     * Creates a new SignedEvent instance using the specified properties.
     * @param [properties] Properties to set
     * @returns SignedEvent instance
     */
    public static create(
      properties?: polycentric.ISignedEvent
    ): polycentric.SignedEvent;

    /**
     * Encodes the specified SignedEvent message. Does not implicitly {@link polycentric.SignedEvent.verify|verify} messages.
     * @param message SignedEvent message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.ISignedEvent,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified SignedEvent message, length delimited. Does not implicitly {@link polycentric.SignedEvent.verify|verify} messages.
     * @param message SignedEvent message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.ISignedEvent,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a SignedEvent message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns SignedEvent
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.SignedEvent;

    /**
     * Decodes a SignedEvent message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns SignedEvent
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.SignedEvent;

    /**
     * Verifies a SignedEvent message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a SignedEvent message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns SignedEvent
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.SignedEvent;

    /**
     * Creates a plain object from a SignedEvent message. Also converts values to other types if specified.
     * @param message SignedEvent
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.SignedEvent,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this SignedEvent to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for SignedEvent
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of an Events. */
  interface IEvents {
    /** Events events */
    events?: polycentric.ISignedEvent[] | null;
  }

  /** Represents an Events. */
  class Events implements IEvents {
    /**
     * Constructs a new Events.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IEvents);

    /** Events events. */
    public events: polycentric.ISignedEvent[];

    /**
     * Creates a new Events instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Events instance
     */
    public static create(properties?: polycentric.IEvents): polycentric.Events;

    /**
     * Encodes the specified Events message. Does not implicitly {@link polycentric.Events.verify|verify} messages.
     * @param message Events message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IEvents,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Events message, length delimited. Does not implicitly {@link polycentric.Events.verify|verify} messages.
     * @param message Events message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IEvents,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an Events message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Events
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.Events;

    /**
     * Decodes an Events message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Events
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.Events;

    /**
     * Verifies an Events message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an Events message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Events
     */
    public static fromObject(object: { [k: string]: any }): polycentric.Events;

    /**
     * Creates a plain object from an Events message. Also converts values to other types if specified.
     * @param message Events
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.Events,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Events to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Events
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a Post. */
  interface IPost {
    /** Post content */
    content?: string | null;

    /** Post image */
    image?: polycentric.IImageManifest | null;
  }

  /** Represents a Post. */
  class Post implements IPost {
    /**
     * Constructs a new Post.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IPost);

    /** Post content. */
    public content: string;

    /** Post image. */
    public image?: polycentric.IImageManifest | null;

    /**
     * Creates a new Post instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Post instance
     */
    public static create(properties?: polycentric.IPost): polycentric.Post;

    /**
     * Encodes the specified Post message. Does not implicitly {@link polycentric.Post.verify|verify} messages.
     * @param message Post message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IPost,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Post message, length delimited. Does not implicitly {@link polycentric.Post.verify|verify} messages.
     * @param message Post message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IPost,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a Post message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Post
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.Post;

    /**
     * Decodes a Post message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Post
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.Post;

    /**
     * Verifies a Post message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a Post message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Post
     */
    public static fromObject(object: { [k: string]: any }): polycentric.Post;

    /**
     * Creates a plain object from a Post message. Also converts values to other types if specified.
     * @param message Post
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.Post,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Post to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Post
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of an ImageManifest. */
  interface IImageManifest {
    /** ImageManifest mime */
    mime?: string | null;

    /** ImageManifest width */
    width?: number | null;

    /** ImageManifest height */
    height?: number | null;

    /** ImageManifest digest */
    digest?: Uint8Array | null;
  }

  /** Represents an ImageManifest. */
  class ImageManifest implements IImageManifest {
    /**
     * Constructs a new ImageManifest.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IImageManifest);

    /** ImageManifest mime. */
    public mime: string;

    /** ImageManifest width. */
    public width: number;

    /** ImageManifest height. */
    public height: number;

    /** ImageManifest digest. */
    public digest: Uint8Array;

    /**
     * Creates a new ImageManifest instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ImageManifest instance
     */
    public static create(
      properties?: polycentric.IImageManifest
    ): polycentric.ImageManifest;

    /**
     * Encodes the specified ImageManifest message. Does not implicitly {@link polycentric.ImageManifest.verify|verify} messages.
     * @param message ImageManifest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IImageManifest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ImageManifest message, length delimited. Does not implicitly {@link polycentric.ImageManifest.verify|verify} messages.
     * @param message ImageManifest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IImageManifest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an ImageManifest message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ImageManifest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.ImageManifest;

    /**
     * Decodes an ImageManifest message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ImageManifest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.ImageManifest;

    /**
     * Verifies an ImageManifest message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an ImageManifest message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ImageManifest
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.ImageManifest;

    /**
     * Creates a plain object from an ImageManifest message. Also converts values to other types if specified.
     * @param message ImageManifest
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.ImageManifest,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ImageManifest to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ImageManifest
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of an ImageBundle. */
  interface IImageBundle {
    /** ImageBundle images */
    images?: polycentric.IImageManifest[] | null;
  }

  /** Represents an ImageBundle. */
  class ImageBundle implements IImageBundle {
    /**
     * Constructs a new ImageBundle.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IImageBundle);

    /** ImageBundle images. */
    public images: polycentric.IImageManifest[];

    /**
     * Creates a new ImageBundle instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ImageBundle instance
     */
    public static create(
      properties?: polycentric.IImageBundle
    ): polycentric.ImageBundle;

    /**
     * Encodes the specified ImageBundle message. Does not implicitly {@link polycentric.ImageBundle.verify|verify} messages.
     * @param message ImageBundle message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IImageBundle,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ImageBundle message, length delimited. Does not implicitly {@link polycentric.ImageBundle.verify|verify} messages.
     * @param message ImageBundle message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IImageBundle,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an ImageBundle message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ImageBundle
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.ImageBundle;

    /**
     * Decodes an ImageBundle message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ImageBundle
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.ImageBundle;

    /**
     * Verifies an ImageBundle message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an ImageBundle message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ImageBundle
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.ImageBundle;

    /**
     * Creates a plain object from an ImageBundle message. Also converts values to other types if specified.
     * @param message ImageBundle
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.ImageBundle,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ImageBundle to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ImageBundle
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a Claim. */
  interface IClaim {
    /** Claim claimType */
    claimType?: number | Long | null;

    /** Claim fields */
    fields?: polycentric.IClaimFieldEntry[] | null;
  }

  /** Represents a Claim. */
  class Claim implements IClaim {
    /**
     * Constructs a new Claim.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IClaim);

    /** Claim claimType. */
    public claimType: number | Long;

    /** Claim fields. */
    public fields: polycentric.IClaimFieldEntry[];

    /**
     * Creates a new Claim instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Claim instance
     */
    public static create(properties?: polycentric.IClaim): polycentric.Claim;

    /**
     * Encodes the specified Claim message. Does not implicitly {@link polycentric.Claim.verify|verify} messages.
     * @param message Claim message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IClaim,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Claim message, length delimited. Does not implicitly {@link polycentric.Claim.verify|verify} messages.
     * @param message Claim message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IClaim,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a Claim message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Claim
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.Claim;

    /**
     * Decodes a Claim message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Claim
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.Claim;

    /**
     * Verifies a Claim message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a Claim message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Claim
     */
    public static fromObject(object: { [k: string]: any }): polycentric.Claim;

    /**
     * Creates a plain object from a Claim message. Also converts values to other types if specified.
     * @param message Claim
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.Claim,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Claim to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Claim
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a ClaimFieldEntry. */
  interface IClaimFieldEntry {
    /** ClaimFieldEntry key */
    key?: number | Long | null;

    /** ClaimFieldEntry value */
    value?: string | null;
  }

  /** Represents a ClaimFieldEntry. */
  class ClaimFieldEntry implements IClaimFieldEntry {
    /**
     * Constructs a new ClaimFieldEntry.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IClaimFieldEntry);

    /** ClaimFieldEntry key. */
    public key: number | Long;

    /** ClaimFieldEntry value. */
    public value: string;

    /**
     * Creates a new ClaimFieldEntry instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ClaimFieldEntry instance
     */
    public static create(
      properties?: polycentric.IClaimFieldEntry
    ): polycentric.ClaimFieldEntry;

    /**
     * Encodes the specified ClaimFieldEntry message. Does not implicitly {@link polycentric.ClaimFieldEntry.verify|verify} messages.
     * @param message ClaimFieldEntry message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IClaimFieldEntry,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ClaimFieldEntry message, length delimited. Does not implicitly {@link polycentric.ClaimFieldEntry.verify|verify} messages.
     * @param message ClaimFieldEntry message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IClaimFieldEntry,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a ClaimFieldEntry message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ClaimFieldEntry
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.ClaimFieldEntry;

    /**
     * Decodes a ClaimFieldEntry message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ClaimFieldEntry
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.ClaimFieldEntry;

    /**
     * Verifies a ClaimFieldEntry message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a ClaimFieldEntry message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ClaimFieldEntry
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.ClaimFieldEntry;

    /**
     * Creates a plain object from a ClaimFieldEntry message. Also converts values to other types if specified.
     * @param message ClaimFieldEntry
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.ClaimFieldEntry,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ClaimFieldEntry to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ClaimFieldEntry
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a Delete. */
  interface IDelete {
    /** Delete process */
    process?: polycentric.IProcess | null;

    /** Delete logicalClock */
    logicalClock?: number | Long | null;

    /** Delete indices */
    indices?: polycentric.IIndices | null;

    /** Delete unixMilliseconds */
    unixMilliseconds?: number | Long | null;

    /** Delete contentType */
    contentType?: polycentric.ContentType | null;
  }

  /** Represents a Delete. */
  class Delete implements IDelete {
    /**
     * Constructs a new Delete.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IDelete);

    /** Delete process. */
    public process?: polycentric.IProcess | null;

    /** Delete logicalClock. */
    public logicalClock: number | Long;

    /** Delete indices. */
    public indices?: polycentric.IIndices | null;

    /** Delete unixMilliseconds. */
    public unixMilliseconds?: number | Long | null;

    /** Delete contentType. */
    public contentType: polycentric.ContentType;

    /**
     * Creates a new Delete instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Delete instance
     */
    public static create(properties?: polycentric.IDelete): polycentric.Delete;

    /**
     * Encodes the specified Delete message. Does not implicitly {@link polycentric.Delete.verify|verify} messages.
     * @param message Delete message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IDelete,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Delete message, length delimited. Does not implicitly {@link polycentric.Delete.verify|verify} messages.
     * @param message Delete message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IDelete,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a Delete message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Delete
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.Delete;

    /**
     * Decodes a Delete message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Delete
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.Delete;

    /**
     * Verifies a Delete message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a Delete message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Delete
     */
    public static fromObject(object: { [k: string]: any }): polycentric.Delete;

    /**
     * Creates a plain object from a Delete message. Also converts values to other types if specified.
     * @param message Delete
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.Delete,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Delete to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Delete
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a SystemProcesses. */
  interface ISystemProcesses {
    /** SystemProcesses processes */
    processes?: polycentric.IProcess[] | null;
  }

  /** Represents a SystemProcesses. */
  class SystemProcesses implements ISystemProcesses {
    /**
     * Constructs a new SystemProcesses.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.ISystemProcesses);

    /** SystemProcesses processes. */
    public processes: polycentric.IProcess[];

    /**
     * Creates a new SystemProcesses instance using the specified properties.
     * @param [properties] Properties to set
     * @returns SystemProcesses instance
     */
    public static create(
      properties?: polycentric.ISystemProcesses
    ): polycentric.SystemProcesses;

    /**
     * Encodes the specified SystemProcesses message. Does not implicitly {@link polycentric.SystemProcesses.verify|verify} messages.
     * @param message SystemProcesses message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.ISystemProcesses,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified SystemProcesses message, length delimited. Does not implicitly {@link polycentric.SystemProcesses.verify|verify} messages.
     * @param message SystemProcesses message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.ISystemProcesses,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a SystemProcesses message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns SystemProcesses
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.SystemProcesses;

    /**
     * Decodes a SystemProcesses message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns SystemProcesses
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.SystemProcesses;

    /**
     * Verifies a SystemProcesses message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a SystemProcesses message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns SystemProcesses
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.SystemProcesses;

    /**
     * Creates a plain object from a SystemProcesses message. Also converts values to other types if specified.
     * @param message SystemProcesses
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.SystemProcesses,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this SystemProcesses to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for SystemProcesses
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a SystemState. */
  interface ISystemState {
    /** SystemState servers */
    servers?: string[] | null;

    /** SystemState authorities */
    authorities?: string[] | null;

    /** SystemState processes */
    processes?: polycentric.IProcess[] | null;
  }

  /** Represents a SystemState. */
  class SystemState implements ISystemState {
    /**
     * Constructs a new SystemState.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.ISystemState);

    /** SystemState servers. */
    public servers: string[];

    /** SystemState authorities. */
    public authorities: string[];

    /** SystemState processes. */
    public processes: polycentric.IProcess[];

    /**
     * Creates a new SystemState instance using the specified properties.
     * @param [properties] Properties to set
     * @returns SystemState instance
     */
    public static create(
      properties?: polycentric.ISystemState
    ): polycentric.SystemState;

    /**
     * Encodes the specified SystemState message. Does not implicitly {@link polycentric.SystemState.verify|verify} messages.
     * @param message SystemState message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.ISystemState,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified SystemState message, length delimited. Does not implicitly {@link polycentric.SystemState.verify|verify} messages.
     * @param message SystemState message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.ISystemState,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a SystemState message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns SystemState
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.SystemState;

    /**
     * Decodes a SystemState message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns SystemState
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.SystemState;

    /**
     * Verifies a SystemState message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a SystemState message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns SystemState
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.SystemState;

    /**
     * Creates a plain object from a SystemState message. Also converts values to other types if specified.
     * @param message SystemState
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.SystemState,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this SystemState to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for SystemState
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a ProcessState. */
  interface IProcessState {
    /** ProcessState logicalClock */
    logicalClock?: number | Long | null;

    /** ProcessState unixMilliseconds */
    unixMilliseconds?: number | Long | null;

    /** ProcessState ranges */
    ranges?: polycentric.IRange[] | null;
  }

  /** Represents a ProcessState. */
  class ProcessState implements IProcessState {
    /**
     * Constructs a new ProcessState.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IProcessState);

    /** ProcessState logicalClock. */
    public logicalClock: number | Long;

    /** ProcessState unixMilliseconds. */
    public unixMilliseconds: number | Long;

    /** ProcessState ranges. */
    public ranges: polycentric.IRange[];

    /**
     * Creates a new ProcessState instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ProcessState instance
     */
    public static create(
      properties?: polycentric.IProcessState
    ): polycentric.ProcessState;

    /**
     * Encodes the specified ProcessState message. Does not implicitly {@link polycentric.ProcessState.verify|verify} messages.
     * @param message ProcessState message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IProcessState,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ProcessState message, length delimited. Does not implicitly {@link polycentric.ProcessState.verify|verify} messages.
     * @param message ProcessState message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IProcessState,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a ProcessState message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ProcessState
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.ProcessState;

    /**
     * Decodes a ProcessState message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ProcessState
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.ProcessState;

    /**
     * Verifies a ProcessState message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a ProcessState message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ProcessState
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.ProcessState;

    /**
     * Creates a plain object from a ProcessState message. Also converts values to other types if specified.
     * @param message ProcessState
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.ProcessState,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ProcessState to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ProcessState
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a Range. */
  interface IRange {
    /** Range low */
    low?: number | Long | null;

    /** Range high */
    high?: number | Long | null;
  }

  /** Represents a Range. */
  class Range implements IRange {
    /**
     * Constructs a new Range.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IRange);

    /** Range low. */
    public low: number | Long;

    /** Range high. */
    public high: number | Long;

    /**
     * Creates a new Range instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Range instance
     */
    public static create(properties?: polycentric.IRange): polycentric.Range;

    /**
     * Encodes the specified Range message. Does not implicitly {@link polycentric.Range.verify|verify} messages.
     * @param message Range message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IRange,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Range message, length delimited. Does not implicitly {@link polycentric.Range.verify|verify} messages.
     * @param message Range message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IRange,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a Range message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Range
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.Range;

    /**
     * Decodes a Range message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Range
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.Range;

    /**
     * Verifies a Range message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a Range message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Range
     */
    public static fromObject(object: { [k: string]: any }): polycentric.Range;

    /**
     * Creates a plain object from a Range message. Also converts values to other types if specified.
     * @param message Range
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.Range,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Range to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Range
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a RangesForProcess. */
  interface IRangesForProcess {
    /** RangesForProcess process */
    process?: polycentric.IProcess | null;

    /** RangesForProcess ranges */
    ranges?: polycentric.IRange[] | null;
  }

  /** Represents a RangesForProcess. */
  class RangesForProcess implements IRangesForProcess {
    /**
     * Constructs a new RangesForProcess.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IRangesForProcess);

    /** RangesForProcess process. */
    public process?: polycentric.IProcess | null;

    /** RangesForProcess ranges. */
    public ranges: polycentric.IRange[];

    /**
     * Creates a new RangesForProcess instance using the specified properties.
     * @param [properties] Properties to set
     * @returns RangesForProcess instance
     */
    public static create(
      properties?: polycentric.IRangesForProcess
    ): polycentric.RangesForProcess;

    /**
     * Encodes the specified RangesForProcess message. Does not implicitly {@link polycentric.RangesForProcess.verify|verify} messages.
     * @param message RangesForProcess message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IRangesForProcess,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified RangesForProcess message, length delimited. Does not implicitly {@link polycentric.RangesForProcess.verify|verify} messages.
     * @param message RangesForProcess message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IRangesForProcess,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a RangesForProcess message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns RangesForProcess
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.RangesForProcess;

    /**
     * Decodes a RangesForProcess message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns RangesForProcess
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.RangesForProcess;

    /**
     * Verifies a RangesForProcess message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a RangesForProcess message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns RangesForProcess
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.RangesForProcess;

    /**
     * Creates a plain object from a RangesForProcess message. Also converts values to other types if specified.
     * @param message RangesForProcess
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.RangesForProcess,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this RangesForProcess to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for RangesForProcess
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a RangesForSystem. */
  interface IRangesForSystem {
    /** RangesForSystem rangesForProcesses */
    rangesForProcesses?: polycentric.IRangesForProcess[] | null;
  }

  /** Represents a RangesForSystem. */
  class RangesForSystem implements IRangesForSystem {
    /**
     * Constructs a new RangesForSystem.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IRangesForSystem);

    /** RangesForSystem rangesForProcesses. */
    public rangesForProcesses: polycentric.IRangesForProcess[];

    /**
     * Creates a new RangesForSystem instance using the specified properties.
     * @param [properties] Properties to set
     * @returns RangesForSystem instance
     */
    public static create(
      properties?: polycentric.IRangesForSystem
    ): polycentric.RangesForSystem;

    /**
     * Encodes the specified RangesForSystem message. Does not implicitly {@link polycentric.RangesForSystem.verify|verify} messages.
     * @param message RangesForSystem message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IRangesForSystem,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified RangesForSystem message, length delimited. Does not implicitly {@link polycentric.RangesForSystem.verify|verify} messages.
     * @param message RangesForSystem message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IRangesForSystem,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a RangesForSystem message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns RangesForSystem
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.RangesForSystem;

    /**
     * Decodes a RangesForSystem message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns RangesForSystem
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.RangesForSystem;

    /**
     * Verifies a RangesForSystem message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a RangesForSystem message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns RangesForSystem
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.RangesForSystem;

    /**
     * Creates a plain object from a RangesForSystem message. Also converts values to other types if specified.
     * @param message RangesForSystem
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.RangesForSystem,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this RangesForSystem to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for RangesForSystem
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of an OpinionSummary. */
  interface IOpinionSummary {
    /** OpinionSummary likeCount */
    likeCount?: number | Long | null;

    /** OpinionSummary dislikeCount */
    dislikeCount?: number | Long | null;

    /** OpinionSummary neutralCount */
    neutralCount?: number | Long | null;

    /** OpinionSummary userOpinion */
    userOpinion?: number | null;
  }

  /** Represents an OpinionSummary. */
  class OpinionSummary implements IOpinionSummary {
    /**
     * Constructs a new OpinionSummary.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IOpinionSummary);

    /** OpinionSummary likeCount. */
    public likeCount: number | Long;

    /** OpinionSummary dislikeCount. */
    public dislikeCount: number | Long;

    /** OpinionSummary neutralCount. */
    public neutralCount: number | Long;

    /** OpinionSummary userOpinion. */
    public userOpinion?: number | null;

    /**
     * Creates a new OpinionSummary instance using the specified properties.
     * @param [properties] Properties to set
     * @returns OpinionSummary instance
     */
    public static create(
      properties?: polycentric.IOpinionSummary
    ): polycentric.OpinionSummary;

    /**
     * Encodes the specified OpinionSummary message. Does not implicitly {@link polycentric.OpinionSummary.verify|verify} messages.
     * @param message OpinionSummary message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IOpinionSummary,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified OpinionSummary message, length delimited. Does not implicitly {@link polycentric.OpinionSummary.verify|verify} messages.
     * @param message OpinionSummary message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IOpinionSummary,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an OpinionSummary message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns OpinionSummary
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.OpinionSummary;

    /**
     * Decodes an OpinionSummary message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns OpinionSummary
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.OpinionSummary;

    /**
     * Verifies an OpinionSummary message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an OpinionSummary message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns OpinionSummary
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.OpinionSummary;

    /**
     * Creates a plain object from an OpinionSummary message. Also converts values to other types if specified.
     * @param message OpinionSummary
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.OpinionSummary,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this OpinionSummary to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for OpinionSummary
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a BlobMeta. */
  interface IBlobMeta {
    /** BlobMeta mime */
    mime?: string | null;

    /** BlobMeta size */
    size?: number | Long | null;

    /** BlobMeta sections */
    sections?: polycentric.IBlobSection[] | null;
  }

  /** Represents a BlobMeta. */
  class BlobMeta implements IBlobMeta {
    /**
     * Constructs a new BlobMeta.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IBlobMeta);

    /** BlobMeta mime. */
    public mime: string;

    /** BlobMeta size. */
    public size: number | Long;

    /** BlobMeta sections. */
    public sections: polycentric.IBlobSection[];

    /**
     * Creates a new BlobMeta instance using the specified properties.
     * @param [properties] Properties to set
     * @returns BlobMeta instance
     */
    public static create(
      properties?: polycentric.IBlobMeta
    ): polycentric.BlobMeta;

    /**
     * Encodes the specified BlobMeta message. Does not implicitly {@link polycentric.BlobMeta.verify|verify} messages.
     * @param message BlobMeta message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IBlobMeta,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified BlobMeta message, length delimited. Does not implicitly {@link polycentric.BlobMeta.verify|verify} messages.
     * @param message BlobMeta message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IBlobMeta,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a BlobMeta message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns BlobMeta
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.BlobMeta;

    /**
     * Decodes a BlobMeta message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns BlobMeta
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.BlobMeta;

    /**
     * Verifies a BlobMeta message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a BlobMeta message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns BlobMeta
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.BlobMeta;

    /**
     * Creates a plain object from a BlobMeta message. Also converts values to other types if specified.
     * @param message BlobMeta
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.BlobMeta,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this BlobMeta to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for BlobMeta
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a BlobSection. */
  interface IBlobSection {
    /** BlobSection digest */
    digest?: Uint8Array | null;

    /** BlobSection size */
    size?: number | Long | null;
  }

  /** Represents a BlobSection. */
  class BlobSection implements IBlobSection {
    /**
     * Constructs a new BlobSection.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IBlobSection);

    /** BlobSection digest. */
    public digest: Uint8Array;

    /** BlobSection size. */
    public size: number | Long;

    /**
     * Creates a new BlobSection instance using the specified properties.
     * @param [properties] Properties to set
     * @returns BlobSection instance
     */
    public static create(
      properties?: polycentric.IBlobSection
    ): polycentric.BlobSection;

    /**
     * Encodes the specified BlobSection message. Does not implicitly {@link polycentric.BlobSection.verify|verify} messages.
     * @param message BlobSection message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IBlobSection,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified BlobSection message, length delimited. Does not implicitly {@link polycentric.BlobSection.verify|verify} messages.
     * @param message BlobSection message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IBlobSection,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a BlobSection message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns BlobSection
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.BlobSection;

    /**
     * Decodes a BlobSection message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns BlobSection
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.BlobSection;

    /**
     * Verifies a BlobSection message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a BlobSection message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns BlobSection
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.BlobSection;

    /**
     * Creates a plain object from a BlobSection message. Also converts values to other types if specified.
     * @param message BlobSection
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.BlobSection,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this BlobSection to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for BlobSection
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a URLInfo. */
  interface IURLInfo {
    /** URLInfo urlType */
    urlType?: number | Long | null;

    /** URLInfo body */
    body?: Uint8Array | null;
  }

  /** Represents a URLInfo. */
  class URLInfo implements IURLInfo {
    /**
     * Constructs a new URLInfo.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IURLInfo);

    /** URLInfo urlType. */
    public urlType: number | Long;

    /** URLInfo body. */
    public body: Uint8Array;

    /**
     * Creates a new URLInfo instance using the specified properties.
     * @param [properties] Properties to set
     * @returns URLInfo instance
     */
    public static create(
      properties?: polycentric.IURLInfo
    ): polycentric.URLInfo;

    /**
     * Encodes the specified URLInfo message. Does not implicitly {@link polycentric.URLInfo.verify|verify} messages.
     * @param message URLInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IURLInfo,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified URLInfo message, length delimited. Does not implicitly {@link polycentric.URLInfo.verify|verify} messages.
     * @param message URLInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IURLInfo,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a URLInfo message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns URLInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.URLInfo;

    /**
     * Decodes a URLInfo message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns URLInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.URLInfo;

    /**
     * Verifies a URLInfo message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a URLInfo message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns URLInfo
     */
    public static fromObject(object: { [k: string]: any }): polycentric.URLInfo;

    /**
     * Creates a plain object from a URLInfo message. Also converts values to other types if specified.
     * @param message URLInfo
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.URLInfo,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this URLInfo to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for URLInfo
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a URLInfoSystemLink. */
  interface IURLInfoSystemLink {
    /** URLInfoSystemLink system */
    system?: polycentric.IPublicKey | null;

    /** URLInfoSystemLink servers */
    servers?: string[] | null;
  }

  /** Represents a URLInfoSystemLink. */
  class URLInfoSystemLink implements IURLInfoSystemLink {
    /**
     * Constructs a new URLInfoSystemLink.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IURLInfoSystemLink);

    /** URLInfoSystemLink system. */
    public system?: polycentric.IPublicKey | null;

    /** URLInfoSystemLink servers. */
    public servers: string[];

    /**
     * Creates a new URLInfoSystemLink instance using the specified properties.
     * @param [properties] Properties to set
     * @returns URLInfoSystemLink instance
     */
    public static create(
      properties?: polycentric.IURLInfoSystemLink
    ): polycentric.URLInfoSystemLink;

    /**
     * Encodes the specified URLInfoSystemLink message. Does not implicitly {@link polycentric.URLInfoSystemLink.verify|verify} messages.
     * @param message URLInfoSystemLink message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IURLInfoSystemLink,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified URLInfoSystemLink message, length delimited. Does not implicitly {@link polycentric.URLInfoSystemLink.verify|verify} messages.
     * @param message URLInfoSystemLink message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IURLInfoSystemLink,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a URLInfoSystemLink message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns URLInfoSystemLink
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.URLInfoSystemLink;

    /**
     * Decodes a URLInfoSystemLink message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns URLInfoSystemLink
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.URLInfoSystemLink;

    /**
     * Verifies a URLInfoSystemLink message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a URLInfoSystemLink message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns URLInfoSystemLink
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.URLInfoSystemLink;

    /**
     * Creates a plain object from a URLInfoSystemLink message. Also converts values to other types if specified.
     * @param message URLInfoSystemLink
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.URLInfoSystemLink,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this URLInfoSystemLink to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for URLInfoSystemLink
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a URLInfoEventLink. */
  interface IURLInfoEventLink {
    /** URLInfoEventLink system */
    system?: polycentric.IPublicKey | null;

    /** URLInfoEventLink process */
    process?: polycentric.IProcess | null;

    /** URLInfoEventLink logicalClock */
    logicalClock?: number | Long | null;

    /** URLInfoEventLink servers */
    servers?: string[] | null;
  }

  /** Represents a URLInfoEventLink. */
  class URLInfoEventLink implements IURLInfoEventLink {
    /**
     * Constructs a new URLInfoEventLink.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IURLInfoEventLink);

    /** URLInfoEventLink system. */
    public system?: polycentric.IPublicKey | null;

    /** URLInfoEventLink process. */
    public process?: polycentric.IProcess | null;

    /** URLInfoEventLink logicalClock. */
    public logicalClock: number | Long;

    /** URLInfoEventLink servers. */
    public servers: string[];

    /**
     * Creates a new URLInfoEventLink instance using the specified properties.
     * @param [properties] Properties to set
     * @returns URLInfoEventLink instance
     */
    public static create(
      properties?: polycentric.IURLInfoEventLink
    ): polycentric.URLInfoEventLink;

    /**
     * Encodes the specified URLInfoEventLink message. Does not implicitly {@link polycentric.URLInfoEventLink.verify|verify} messages.
     * @param message URLInfoEventLink message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IURLInfoEventLink,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified URLInfoEventLink message, length delimited. Does not implicitly {@link polycentric.URLInfoEventLink.verify|verify} messages.
     * @param message URLInfoEventLink message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IURLInfoEventLink,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a URLInfoEventLink message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns URLInfoEventLink
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.URLInfoEventLink;

    /**
     * Decodes a URLInfoEventLink message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns URLInfoEventLink
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.URLInfoEventLink;

    /**
     * Verifies a URLInfoEventLink message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a URLInfoEventLink message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns URLInfoEventLink
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.URLInfoEventLink;

    /**
     * Creates a plain object from a URLInfoEventLink message. Also converts values to other types if specified.
     * @param message URLInfoEventLink
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.URLInfoEventLink,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this URLInfoEventLink to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for URLInfoEventLink
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of an ExportBundle. */
  interface IExportBundle {
    /** ExportBundle events */
    events?: polycentric.ISignedEvent[] | null;

    /** ExportBundle systemLinks */
    systemLinks?: polycentric.IURLInfoSystemLink[] | null;

    /** ExportBundle eventLinks */
    eventLinks?: polycentric.IURLInfoEventLink[] | null;
  }

  /** Represents an ExportBundle. */
  class ExportBundle implements IExportBundle {
    /**
     * Constructs a new ExportBundle.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IExportBundle);

    /** ExportBundle events. */
    public events: polycentric.ISignedEvent[];

    /** ExportBundle systemLinks. */
    public systemLinks: polycentric.IURLInfoSystemLink[];

    /** ExportBundle eventLinks. */
    public eventLinks: polycentric.IURLInfoEventLink[];

    /**
     * Creates a new ExportBundle instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ExportBundle instance
     */
    public static create(
      properties?: polycentric.IExportBundle
    ): polycentric.ExportBundle;

    /**
     * Encodes the specified ExportBundle message. Does not implicitly {@link polycentric.ExportBundle.verify|verify} messages.
     * @param message ExportBundle message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IExportBundle,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ExportBundle message, length delimited. Does not implicitly {@link polycentric.ExportBundle.verify|verify} messages.
     * @param message ExportBundle message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IExportBundle,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an ExportBundle message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ExportBundle
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.ExportBundle;

    /**
     * Decodes an ExportBundle message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ExportBundle
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.ExportBundle;

    /**
     * Verifies an ExportBundle message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an ExportBundle message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ExportBundle
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.ExportBundle;

    /**
     * Creates a plain object from an ExportBundle message. Also converts values to other types if specified.
     * @param message ExportBundle
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.ExportBundle,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ExportBundle to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ExportBundle
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a HarborChallengeResponse. */
  interface IHarborChallengeResponse {
    /** HarborChallengeResponse body */
    body?: polycentric.IHarborChallengeResponseBody | null;

    /** HarborChallengeResponse signature */
    signature?: Uint8Array | null;
  }

  /** Represents a HarborChallengeResponse. */
  class HarborChallengeResponse implements IHarborChallengeResponse {
    /**
     * Constructs a new HarborChallengeResponse.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IHarborChallengeResponse);

    /** HarborChallengeResponse body. */
    public body?: polycentric.IHarborChallengeResponseBody | null;

    /** HarborChallengeResponse signature. */
    public signature: Uint8Array;

    /**
     * Creates a new HarborChallengeResponse instance using the specified properties.
     * @param [properties] Properties to set
     * @returns HarborChallengeResponse instance
     */
    public static create(
      properties?: polycentric.IHarborChallengeResponse
    ): polycentric.HarborChallengeResponse;

    /**
     * Encodes the specified HarborChallengeResponse message. Does not implicitly {@link polycentric.HarborChallengeResponse.verify|verify} messages.
     * @param message HarborChallengeResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IHarborChallengeResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified HarborChallengeResponse message, length delimited. Does not implicitly {@link polycentric.HarborChallengeResponse.verify|verify} messages.
     * @param message HarborChallengeResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IHarborChallengeResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a HarborChallengeResponse message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns HarborChallengeResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.HarborChallengeResponse;

    /**
     * Decodes a HarborChallengeResponse message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns HarborChallengeResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.HarborChallengeResponse;

    /**
     * Verifies a HarborChallengeResponse message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a HarborChallengeResponse message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns HarborChallengeResponse
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.HarborChallengeResponse;

    /**
     * Creates a plain object from a HarborChallengeResponse message. Also converts values to other types if specified.
     * @param message HarborChallengeResponse
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.HarborChallengeResponse,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this HarborChallengeResponse to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for HarborChallengeResponse
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a HarborChallengeResponseBody. */
  interface IHarborChallengeResponseBody {
    /** HarborChallengeResponseBody challenge */
    challenge?: string | null;

    /** HarborChallengeResponseBody unixMilliseconds */
    unixMilliseconds?: number | Long | null;
  }

  /** Represents a HarborChallengeResponseBody. */
  class HarborChallengeResponseBody implements IHarborChallengeResponseBody {
    /**
     * Constructs a new HarborChallengeResponseBody.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IHarborChallengeResponseBody);

    /** HarborChallengeResponseBody challenge. */
    public challenge: string;

    /** HarborChallengeResponseBody unixMilliseconds. */
    public unixMilliseconds: number | Long;

    /**
     * Creates a new HarborChallengeResponseBody instance using the specified properties.
     * @param [properties] Properties to set
     * @returns HarborChallengeResponseBody instance
     */
    public static create(
      properties?: polycentric.IHarborChallengeResponseBody
    ): polycentric.HarborChallengeResponseBody;

    /**
     * Encodes the specified HarborChallengeResponseBody message. Does not implicitly {@link polycentric.HarborChallengeResponseBody.verify|verify} messages.
     * @param message HarborChallengeResponseBody message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IHarborChallengeResponseBody,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified HarborChallengeResponseBody message, length delimited. Does not implicitly {@link polycentric.HarborChallengeResponseBody.verify|verify} messages.
     * @param message HarborChallengeResponseBody message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IHarborChallengeResponseBody,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a HarborChallengeResponseBody message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns HarborChallengeResponseBody
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.HarborChallengeResponseBody;

    /**
     * Decodes a HarborChallengeResponseBody message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns HarborChallengeResponseBody
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.HarborChallengeResponseBody;

    /**
     * Verifies a HarborChallengeResponseBody message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a HarborChallengeResponseBody message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns HarborChallengeResponseBody
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.HarborChallengeResponseBody;

    /**
     * Creates a plain object from a HarborChallengeResponseBody message. Also converts values to other types if specified.
     * @param message HarborChallengeResponseBody
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.HarborChallengeResponseBody,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this HarborChallengeResponseBody to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for HarborChallengeResponseBody
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a HarborValidateRequest. */
  interface IHarborValidateRequest {
    /** HarborValidateRequest solution */
    solution?: string | null;

    /** HarborValidateRequest challengeResponse */
    challengeResponse?: polycentric.IHarborChallengeResponse | null;
  }

  /** Represents a HarborValidateRequest. */
  class HarborValidateRequest implements IHarborValidateRequest {
    /**
     * Constructs a new HarborValidateRequest.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IHarborValidateRequest);

    /** HarborValidateRequest solution. */
    public solution: string;

    /** HarborValidateRequest challengeResponse. */
    public challengeResponse?: polycentric.IHarborChallengeResponse | null;

    /**
     * Creates a new HarborValidateRequest instance using the specified properties.
     * @param [properties] Properties to set
     * @returns HarborValidateRequest instance
     */
    public static create(
      properties?: polycentric.IHarborValidateRequest
    ): polycentric.HarborValidateRequest;

    /**
     * Encodes the specified HarborValidateRequest message. Does not implicitly {@link polycentric.HarborValidateRequest.verify|verify} messages.
     * @param message HarborValidateRequest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IHarborValidateRequest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified HarborValidateRequest message, length delimited. Does not implicitly {@link polycentric.HarborValidateRequest.verify|verify} messages.
     * @param message HarborValidateRequest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IHarborValidateRequest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a HarborValidateRequest message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns HarborValidateRequest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.HarborValidateRequest;

    /**
     * Decodes a HarborValidateRequest message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns HarborValidateRequest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.HarborValidateRequest;

    /**
     * Verifies a HarborValidateRequest message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a HarborValidateRequest message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns HarborValidateRequest
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.HarborValidateRequest;

    /**
     * Creates a plain object from a HarborValidateRequest message. Also converts values to other types if specified.
     * @param message HarborValidateRequest
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.HarborValidateRequest,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this HarborValidateRequest to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for HarborValidateRequest
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a StorageTypeSystemState. */
  interface IStorageTypeSystemState {
    /** StorageTypeSystemState servers */
    servers?: string[] | null;

    /** StorageTypeSystemState authorities */
    authorities?: string[] | null;

    /** StorageTypeSystemState processes */
    processes?: polycentric.IProcess[] | null;
  }

  /** Represents a StorageTypeSystemState. */
  class StorageTypeSystemState implements IStorageTypeSystemState {
    /**
     * Constructs a new StorageTypeSystemState.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IStorageTypeSystemState);

    /** StorageTypeSystemState servers. */
    public servers: string[];

    /** StorageTypeSystemState authorities. */
    public authorities: string[];

    /** StorageTypeSystemState processes. */
    public processes: polycentric.IProcess[];

    /**
     * Creates a new StorageTypeSystemState instance using the specified properties.
     * @param [properties] Properties to set
     * @returns StorageTypeSystemState instance
     */
    public static create(
      properties?: polycentric.IStorageTypeSystemState
    ): polycentric.StorageTypeSystemState;

    /**
     * Encodes the specified StorageTypeSystemState message. Does not implicitly {@link polycentric.StorageTypeSystemState.verify|verify} messages.
     * @param message StorageTypeSystemState message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IStorageTypeSystemState,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified StorageTypeSystemState message, length delimited. Does not implicitly {@link polycentric.StorageTypeSystemState.verify|verify} messages.
     * @param message StorageTypeSystemState message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IStorageTypeSystemState,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a StorageTypeSystemState message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns StorageTypeSystemState
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.StorageTypeSystemState;

    /**
     * Decodes a StorageTypeSystemState message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns StorageTypeSystemState
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.StorageTypeSystemState;

    /**
     * Verifies a StorageTypeSystemState message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a StorageTypeSystemState message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns StorageTypeSystemState
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.StorageTypeSystemState;

    /**
     * Creates a plain object from a StorageTypeSystemState message. Also converts values to other types if specified.
     * @param message StorageTypeSystemState
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.StorageTypeSystemState,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this StorageTypeSystemState to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for StorageTypeSystemState
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a StorageTypeProcessSecret. */
  interface IStorageTypeProcessSecret {
    /** StorageTypeProcessSecret system */
    system?: polycentric.IPrivateKey | null;

    /** StorageTypeProcessSecret process */
    process?: polycentric.IProcess | null;
  }

  /** Represents a StorageTypeProcessSecret. */
  class StorageTypeProcessSecret implements IStorageTypeProcessSecret {
    /**
     * Constructs a new StorageTypeProcessSecret.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IStorageTypeProcessSecret);

    /** StorageTypeProcessSecret system. */
    public system?: polycentric.IPrivateKey | null;

    /** StorageTypeProcessSecret process. */
    public process?: polycentric.IProcess | null;

    /**
     * Creates a new StorageTypeProcessSecret instance using the specified properties.
     * @param [properties] Properties to set
     * @returns StorageTypeProcessSecret instance
     */
    public static create(
      properties?: polycentric.IStorageTypeProcessSecret
    ): polycentric.StorageTypeProcessSecret;

    /**
     * Encodes the specified StorageTypeProcessSecret message. Does not implicitly {@link polycentric.StorageTypeProcessSecret.verify|verify} messages.
     * @param message StorageTypeProcessSecret message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IStorageTypeProcessSecret,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified StorageTypeProcessSecret message, length delimited. Does not implicitly {@link polycentric.StorageTypeProcessSecret.verify|verify} messages.
     * @param message StorageTypeProcessSecret message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IStorageTypeProcessSecret,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a StorageTypeProcessSecret message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns StorageTypeProcessSecret
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.StorageTypeProcessSecret;

    /**
     * Decodes a StorageTypeProcessSecret message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns StorageTypeProcessSecret
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.StorageTypeProcessSecret;

    /**
     * Verifies a StorageTypeProcessSecret message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a StorageTypeProcessSecret message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns StorageTypeProcessSecret
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.StorageTypeProcessSecret;

    /**
     * Creates a plain object from a StorageTypeProcessSecret message. Also converts values to other types if specified.
     * @param message StorageTypeProcessSecret
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.StorageTypeProcessSecret,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this StorageTypeProcessSecret to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for StorageTypeProcessSecret
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a QueryEngineStats. */
  interface IQueryEngineStats {
    /** QueryEngineStats totalEvents */
    totalEvents?: number | Long | null;

    /** QueryEngineStats systemCount */
    systemCount?: number | Long | null;

    /** QueryEngineStats processCount */
    processCount?: number | Long | null;

    /** QueryEngineStats memoryUsage */
    memoryUsage?: polycentric.QueryEngineStats.IMemoryUsage | null;
  }

  /** Represents a QueryEngineStats. */
  class QueryEngineStats implements IQueryEngineStats {
    /**
     * Constructs a new QueryEngineStats.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IQueryEngineStats);

    /** QueryEngineStats totalEvents. */
    public totalEvents: number | Long;

    /** QueryEngineStats systemCount. */
    public systemCount: number | Long;

    /** QueryEngineStats processCount. */
    public processCount: number | Long;

    /** QueryEngineStats memoryUsage. */
    public memoryUsage?: polycentric.QueryEngineStats.IMemoryUsage | null;

    /**
     * Creates a new QueryEngineStats instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryEngineStats instance
     */
    public static create(
      properties?: polycentric.IQueryEngineStats
    ): polycentric.QueryEngineStats;

    /**
     * Encodes the specified QueryEngineStats message. Does not implicitly {@link polycentric.QueryEngineStats.verify|verify} messages.
     * @param message QueryEngineStats message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IQueryEngineStats,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified QueryEngineStats message, length delimited. Does not implicitly {@link polycentric.QueryEngineStats.verify|verify} messages.
     * @param message QueryEngineStats message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IQueryEngineStats,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a QueryEngineStats message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryEngineStats
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.QueryEngineStats;

    /**
     * Decodes a QueryEngineStats message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryEngineStats
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.QueryEngineStats;

    /**
     * Verifies a QueryEngineStats message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a QueryEngineStats message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryEngineStats
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.QueryEngineStats;

    /**
     * Creates a plain object from a QueryEngineStats message. Also converts values to other types if specified.
     * @param message QueryEngineStats
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.QueryEngineStats,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this QueryEngineStats to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryEngineStats
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  namespace QueryEngineStats {
    /** Properties of a MemoryUsage. */
    interface IMemoryUsage {
      /** MemoryUsage bytes */
      bytes?: number | Long | null;
    }

    /** Represents a MemoryUsage. */
    class MemoryUsage implements IMemoryUsage {
      /**
       * Constructs a new MemoryUsage.
       * @param [properties] Properties to set
       */
      constructor(properties?: polycentric.QueryEngineStats.IMemoryUsage);

      /** MemoryUsage bytes. */
      public bytes: number | Long;

      /**
       * Creates a new MemoryUsage instance using the specified properties.
       * @param [properties] Properties to set
       * @returns MemoryUsage instance
       */
      public static create(
        properties?: polycentric.QueryEngineStats.IMemoryUsage
      ): polycentric.QueryEngineStats.MemoryUsage;

      /**
       * Encodes the specified MemoryUsage message. Does not implicitly {@link polycentric.QueryEngineStats.MemoryUsage.verify|verify} messages.
       * @param message MemoryUsage message or plain object to encode
       * @param [writer] Writer to encode to
       * @returns Writer
       */
      public static encode(
        message: polycentric.QueryEngineStats.IMemoryUsage,
        writer?: $protobuf.Writer
      ): $protobuf.Writer;

      /**
       * Encodes the specified MemoryUsage message, length delimited. Does not implicitly {@link polycentric.QueryEngineStats.MemoryUsage.verify|verify} messages.
       * @param message MemoryUsage message or plain object to encode
       * @param [writer] Writer to encode to
       * @returns Writer
       */
      public static encodeDelimited(
        message: polycentric.QueryEngineStats.IMemoryUsage,
        writer?: $protobuf.Writer
      ): $protobuf.Writer;

      /**
       * Decodes a MemoryUsage message from the specified reader or buffer.
       * @param reader Reader or buffer to decode from
       * @param [length] Message length if known beforehand
       * @returns MemoryUsage
       * @throws {Error} If the payload is not a reader or valid buffer
       * @throws {$protobuf.util.ProtocolError} If required fields are missing
       */
      public static decode(
        reader: $protobuf.Reader | Uint8Array,
        length?: number
      ): polycentric.QueryEngineStats.MemoryUsage;

      /**
       * Decodes a MemoryUsage message from the specified reader or buffer, length delimited.
       * @param reader Reader or buffer to decode from
       * @returns MemoryUsage
       * @throws {Error} If the payload is not a reader or valid buffer
       * @throws {$protobuf.util.ProtocolError} If required fields are missing
       */
      public static decodeDelimited(
        reader: $protobuf.Reader | Uint8Array
      ): polycentric.QueryEngineStats.MemoryUsage;

      /**
       * Verifies a MemoryUsage message.
       * @param message Plain object to verify
       * @returns `null` if valid, otherwise the reason why it is not
       */
      public static verify(message: { [k: string]: any }): string | null;

      /**
       * Creates a MemoryUsage message from a plain object. Also converts values to their respective internal types.
       * @param object Plain object
       * @returns MemoryUsage
       */
      public static fromObject(object: {
        [k: string]: any;
      }): polycentric.QueryEngineStats.MemoryUsage;

      /**
       * Creates a plain object from a MemoryUsage message. Also converts values to other types if specified.
       * @param message MemoryUsage
       * @param [options] Conversion options
       * @returns Plain object
       */
      public static toObject(
        message: polycentric.QueryEngineStats.MemoryUsage,
        options?: $protobuf.IConversionOptions
      ): { [k: string]: any };

      /**
       * Converts this MemoryUsage to JSON.
       * @returns JSON object
       */
      public toJSON(): { [k: string]: any };

      /**
       * Gets the default type url for MemoryUsage
       * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
       * @returns The default type url
       */
      public static getTypeUrl(typeUrlPrefix?: string): string;
    }
  }

  /** Properties of an EventCreationData. */
  interface IEventCreationData {
    /** EventCreationData system */
    system?: polycentric.IPublicKey | null;

    /** EventCreationData process */
    process?: polycentric.IProcess | null;

    /** EventCreationData contentType */
    contentType?: polycentric.ContentType | null;

    /** EventCreationData content */
    content?: Uint8Array | null;

    /** EventCreationData indices */
    indices?: polycentric.IIndices | null;

    /** EventCreationData lwwElementSet */
    lwwElementSet?: polycentric.ILWWElementSet | null;

    /** EventCreationData lwwElement */
    lwwElement?: polycentric.ILWWElement | null;

    /** EventCreationData references */
    references?: polycentric.IReference[] | null;

    /** EventCreationData unixMilliseconds */
    unixMilliseconds?: number | Long | null;

    /** EventCreationData logicalClock */
    logicalClock?: number | Long | null;
  }

  /** Represents an EventCreationData. */
  class EventCreationData implements IEventCreationData {
    /**
     * Constructs a new EventCreationData.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IEventCreationData);

    /** EventCreationData system. */
    public system?: polycentric.IPublicKey | null;

    /** EventCreationData process. */
    public process?: polycentric.IProcess | null;

    /** EventCreationData contentType. */
    public contentType: polycentric.ContentType;

    /** EventCreationData content. */
    public content: Uint8Array;

    /** EventCreationData indices. */
    public indices?: polycentric.IIndices | null;

    /** EventCreationData lwwElementSet. */
    public lwwElementSet?: polycentric.ILWWElementSet | null;

    /** EventCreationData lwwElement. */
    public lwwElement?: polycentric.ILWWElement | null;

    /** EventCreationData references. */
    public references: polycentric.IReference[];

    /** EventCreationData unixMilliseconds. */
    public unixMilliseconds?: number | Long | null;

    /** EventCreationData logicalClock. */
    public logicalClock?: number | Long | null;

    /**
     * Creates a new EventCreationData instance using the specified properties.
     * @param [properties] Properties to set
     * @returns EventCreationData instance
     */
    public static create(
      properties?: polycentric.IEventCreationData
    ): polycentric.EventCreationData;

    /**
     * Encodes the specified EventCreationData message. Does not implicitly {@link polycentric.EventCreationData.verify|verify} messages.
     * @param message EventCreationData message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IEventCreationData,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified EventCreationData message, length delimited. Does not implicitly {@link polycentric.EventCreationData.verify|verify} messages.
     * @param message EventCreationData message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IEventCreationData,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an EventCreationData message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns EventCreationData
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.EventCreationData;

    /**
     * Decodes an EventCreationData message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns EventCreationData
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.EventCreationData;

    /**
     * Verifies an EventCreationData message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an EventCreationData message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns EventCreationData
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.EventCreationData;

    /**
     * Creates a plain object from an EventCreationData message. Also converts values to other types if specified.
     * @param message EventCreationData
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.EventCreationData,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this EventCreationData to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for EventCreationData
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of an Event. */
  interface IEvent {
    /** Event system */
    system?: polycentric.IPublicKey | null;

    /** Event process */
    process?: polycentric.IProcess | null;

    /** Event logicalClock */
    logicalClock?: number | Long | null;

    /** Event contentType */
    contentType?: polycentric.ContentType | null;

    /** Event content */
    content?: Uint8Array | null;

    /** Event vectorClock */
    vectorClock?: polycentric.IVectorClock | null;

    /** Event indices */
    indices?: polycentric.IIndices | null;

    /** Event lwwElementSet */
    lwwElementSet?: polycentric.ILWWElementSet | null;

    /** Event lwwElement */
    lwwElement?: polycentric.ILWWElement | null;

    /** Event references */
    references?: polycentric.IReference[] | null;

    /** Event unixMilliseconds */
    unixMilliseconds?: number | Long | null;
  }

  /** Represents an Event. */
  class Event implements IEvent {
    /**
     * Constructs a new Event.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IEvent);

    /** Event system. */
    public system?: polycentric.IPublicKey | null;

    /** Event process. */
    public process?: polycentric.IProcess | null;

    /** Event logicalClock. */
    public logicalClock: number | Long;

    /** Event contentType. */
    public contentType: polycentric.ContentType;

    /** Event content. */
    public content: Uint8Array;

    /** Event vectorClock. */
    public vectorClock?: polycentric.IVectorClock | null;

    /** Event indices. */
    public indices?: polycentric.IIndices | null;

    /** Event lwwElementSet. */
    public lwwElementSet?: polycentric.ILWWElementSet | null;

    /** Event lwwElement. */
    public lwwElement?: polycentric.ILWWElement | null;

    /** Event references. */
    public references: polycentric.IReference[];

    /** Event unixMilliseconds. */
    public unixMilliseconds?: number | Long | null;

    /**
     * Creates a new Event instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Event instance
     */
    public static create(properties?: polycentric.IEvent): polycentric.Event;

    /**
     * Encodes the specified Event message. Does not implicitly {@link polycentric.Event.verify|verify} messages.
     * @param message Event message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IEvent,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Event message, length delimited. Does not implicitly {@link polycentric.Event.verify|verify} messages.
     * @param message Event message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IEvent,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an Event message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Event
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.Event;

    /**
     * Decodes an Event message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Event
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.Event;

    /**
     * Verifies an Event message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an Event message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Event
     */
    public static fromObject(object: { [k: string]: any }): polycentric.Event;

    /**
     * Creates a plain object from an Event message. Also converts values to other types if specified.
     * @param message Event
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.Event,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Event to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Event
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a ReferencesResult. */
  interface IReferencesResult {
    /** ReferencesResult events */
    events?: polycentric.ISignedEvent[] | null;

    /** ReferencesResult relatedEvents */
    relatedEvents?: polycentric.ISignedEvent[] | null;

    /** ReferencesResult cursor */
    cursor?: Uint8Array | null;
  }

  /** Represents a ReferencesResult. */
  class ReferencesResult implements IReferencesResult {
    /**
     * Constructs a new ReferencesResult.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IReferencesResult);

    /** ReferencesResult events. */
    public events: polycentric.ISignedEvent[];

    /** ReferencesResult relatedEvents. */
    public relatedEvents: polycentric.ISignedEvent[];

    /** ReferencesResult cursor. */
    public cursor: Uint8Array;

    /**
     * Creates a new ReferencesResult instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ReferencesResult instance
     */
    public static create(
      properties?: polycentric.IReferencesResult
    ): polycentric.ReferencesResult;

    /**
     * Encodes the specified ReferencesResult message. Does not implicitly {@link polycentric.ReferencesResult.verify|verify} messages.
     * @param message ReferencesResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IReferencesResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ReferencesResult message, length delimited. Does not implicitly {@link polycentric.ReferencesResult.verify|verify} messages.
     * @param message ReferencesResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IReferencesResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a ReferencesResult message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ReferencesResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.ReferencesResult;

    /**
     * Decodes a ReferencesResult message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ReferencesResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.ReferencesResult;

    /**
     * Verifies a ReferencesResult message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a ReferencesResult message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ReferencesResult
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.ReferencesResult;

    /**
     * Creates a plain object from a ReferencesResult message. Also converts values to other types if specified.
     * @param message ReferencesResult
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.ReferencesResult,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ReferencesResult to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ReferencesResult
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a FeedResult. */
  interface IFeedResult {
    /** FeedResult events */
    events?: polycentric.ISignedEvent[] | null;

    /** FeedResult cursor */
    cursor?: Uint8Array | null;
  }

  /** Represents a FeedResult. */
  class FeedResult implements IFeedResult {
    /**
     * Constructs a new FeedResult.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IFeedResult);

    /** FeedResult events. */
    public events: polycentric.ISignedEvent[];

    /** FeedResult cursor. */
    public cursor: Uint8Array;

    /**
     * Creates a new FeedResult instance using the specified properties.
     * @param [properties] Properties to set
     * @returns FeedResult instance
     */
    public static create(
      properties?: polycentric.IFeedResult
    ): polycentric.FeedResult;

    /**
     * Encodes the specified FeedResult message. Does not implicitly {@link polycentric.FeedResult.verify|verify} messages.
     * @param message FeedResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IFeedResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified FeedResult message, length delimited. Does not implicitly {@link polycentric.FeedResult.verify|verify} messages.
     * @param message FeedResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IFeedResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a FeedResult message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns FeedResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.FeedResult;

    /**
     * Decodes a FeedResult message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns FeedResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.FeedResult;

    /**
     * Verifies a FeedResult message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a FeedResult message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns FeedResult
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.FeedResult;

    /**
     * Creates a plain object from a FeedResult message. Also converts values to other types if specified.
     * @param message FeedResult
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.FeedResult,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this FeedResult to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for FeedResult
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a CountReferencesResult. */
  interface ICountReferencesResult {
    /** CountReferencesResult counts */
    counts?: (number | Long)[] | null;
  }

  /** Represents a CountReferencesResult. */
  class CountReferencesResult implements ICountReferencesResult {
    /**
     * Constructs a new CountReferencesResult.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.ICountReferencesResult);

    /** CountReferencesResult counts. */
    public counts: (number | Long)[];

    /**
     * Creates a new CountReferencesResult instance using the specified properties.
     * @param [properties] Properties to set
     * @returns CountReferencesResult instance
     */
    public static create(
      properties?: polycentric.ICountReferencesResult
    ): polycentric.CountReferencesResult;

    /**
     * Encodes the specified CountReferencesResult message. Does not implicitly {@link polycentric.CountReferencesResult.verify|verify} messages.
     * @param message CountReferencesResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.ICountReferencesResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified CountReferencesResult message, length delimited. Does not implicitly {@link polycentric.CountReferencesResult.verify|verify} messages.
     * @param message CountReferencesResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.ICountReferencesResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a CountReferencesResult message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns CountReferencesResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.CountReferencesResult;

    /**
     * Decodes a CountReferencesResult message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns CountReferencesResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.CountReferencesResult;

    /**
     * Verifies a CountReferencesResult message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a CountReferencesResult message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns CountReferencesResult
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.CountReferencesResult;

    /**
     * Creates a plain object from a CountReferencesResult message. Also converts values to other types if specified.
     * @param message CountReferencesResult
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.CountReferencesResult,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this CountReferencesResult to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for CountReferencesResult
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of an EventCreationResult. */
  interface IEventCreationResult {
    /** EventCreationResult event */
    event?: Uint8Array | null;

    /** EventCreationResult logicalClock */
    logicalClock?: number | Long | null;
  }

  /** Represents an EventCreationResult. */
  class EventCreationResult implements IEventCreationResult {
    /**
     * Constructs a new EventCreationResult.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IEventCreationResult);

    /** EventCreationResult event. */
    public event: Uint8Array;

    /** EventCreationResult logicalClock. */
    public logicalClock: number | Long;

    /**
     * Creates a new EventCreationResult instance using the specified properties.
     * @param [properties] Properties to set
     * @returns EventCreationResult instance
     */
    public static create(
      properties?: polycentric.IEventCreationResult
    ): polycentric.EventCreationResult;

    /**
     * Encodes the specified EventCreationResult message. Does not implicitly {@link polycentric.EventCreationResult.verify|verify} messages.
     * @param message EventCreationResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IEventCreationResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified EventCreationResult message, length delimited. Does not implicitly {@link polycentric.EventCreationResult.verify|verify} messages.
     * @param message EventCreationResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IEventCreationResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an EventCreationResult message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns EventCreationResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.EventCreationResult;

    /**
     * Decodes an EventCreationResult message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns EventCreationResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.EventCreationResult;

    /**
     * Verifies an EventCreationResult message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an EventCreationResult message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns EventCreationResult
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.EventCreationResult;

    /**
     * Creates a plain object from an EventCreationResult message. Also converts values to other types if specified.
     * @param message EventCreationResult
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.EventCreationResult,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this EventCreationResult to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for EventCreationResult
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of an EventKey. */
  interface IEventKey {
    /** EventKey systemKeyType */
    systemKeyType?: number | Long | null;

    /** EventKey systemKey */
    systemKey?: Uint8Array | null;

    /** EventKey process */
    process?: Uint8Array | null;

    /** EventKey logicalClock */
    logicalClock?: number | Long | null;
  }

  /** Represents an EventKey. */
  class EventKey implements IEventKey {
    /**
     * Constructs a new EventKey.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IEventKey);

    /** EventKey systemKeyType. */
    public systemKeyType: number | Long;

    /** EventKey systemKey. */
    public systemKey: Uint8Array;

    /** EventKey process. */
    public process: Uint8Array;

    /** EventKey logicalClock. */
    public logicalClock: number | Long;

    /**
     * Creates a new EventKey instance using the specified properties.
     * @param [properties] Properties to set
     * @returns EventKey instance
     */
    public static create(
      properties?: polycentric.IEventKey
    ): polycentric.EventKey;

    /**
     * Encodes the specified EventKey message. Does not implicitly {@link polycentric.EventKey.verify|verify} messages.
     * @param message EventKey message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IEventKey,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified EventKey message, length delimited. Does not implicitly {@link polycentric.EventKey.verify|verify} messages.
     * @param message EventKey message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IEventKey,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an EventKey message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns EventKey
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.EventKey;

    /**
     * Decodes an EventKey message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns EventKey
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.EventKey;

    /**
     * Verifies an EventKey message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an EventKey message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns EventKey
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.EventKey;

    /**
     * Creates a plain object from an EventKey message. Also converts values to other types if specified.
     * @param message EventKey
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.EventKey,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this EventKey to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for EventKey
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a FeedCursor. */
  interface IFeedCursor {
    /** FeedCursor unixMilliseconds */
    unixMilliseconds?: number | Long | null;

    /** FeedCursor eventKey */
    eventKey?: polycentric.IEventKey | null;
  }

  /** Represents a FeedCursor. */
  class FeedCursor implements IFeedCursor {
    /**
     * Constructs a new FeedCursor.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IFeedCursor);

    /** FeedCursor unixMilliseconds. */
    public unixMilliseconds: number | Long;

    /** FeedCursor eventKey. */
    public eventKey?: polycentric.IEventKey | null;

    /**
     * Creates a new FeedCursor instance using the specified properties.
     * @param [properties] Properties to set
     * @returns FeedCursor instance
     */
    public static create(
      properties?: polycentric.IFeedCursor
    ): polycentric.FeedCursor;

    /**
     * Encodes the specified FeedCursor message. Does not implicitly {@link polycentric.FeedCursor.verify|verify} messages.
     * @param message FeedCursor message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IFeedCursor,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified FeedCursor message, length delimited. Does not implicitly {@link polycentric.FeedCursor.verify|verify} messages.
     * @param message FeedCursor message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IFeedCursor,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a FeedCursor message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns FeedCursor
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.FeedCursor;

    /**
     * Decodes a FeedCursor message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns FeedCursor
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.FeedCursor;

    /**
     * Verifies a FeedCursor message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a FeedCursor message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns FeedCursor
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.FeedCursor;

    /**
     * Creates a plain object from a FeedCursor message. Also converts values to other types if specified.
     * @param message FeedCursor
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.FeedCursor,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this FeedCursor to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for FeedCursor
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a ReferenceCursor. */
  interface IReferenceCursor {
    /** ReferenceCursor lastEventKey */
    lastEventKey?: polycentric.IEventKey | null;

    /** ReferenceCursor offset */
    offset?: number | Long | null;

    /** ReferenceCursor processedCount */
    processedCount?: number | Long | null;
  }

  /** Represents a ReferenceCursor. */
  class ReferenceCursor implements IReferenceCursor {
    /**
     * Constructs a new ReferenceCursor.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IReferenceCursor);

    /** ReferenceCursor lastEventKey. */
    public lastEventKey?: polycentric.IEventKey | null;

    /** ReferenceCursor offset. */
    public offset: number | Long;

    /** ReferenceCursor processedCount. */
    public processedCount: number | Long;

    /**
     * Creates a new ReferenceCursor instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ReferenceCursor instance
     */
    public static create(
      properties?: polycentric.IReferenceCursor
    ): polycentric.ReferenceCursor;

    /**
     * Encodes the specified ReferenceCursor message. Does not implicitly {@link polycentric.ReferenceCursor.verify|verify} messages.
     * @param message ReferenceCursor message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IReferenceCursor,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ReferenceCursor message, length delimited. Does not implicitly {@link polycentric.ReferenceCursor.verify|verify} messages.
     * @param message ReferenceCursor message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IReferenceCursor,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a ReferenceCursor message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ReferenceCursor
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.ReferenceCursor;

    /**
     * Decodes a ReferenceCursor message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ReferenceCursor
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.ReferenceCursor;

    /**
     * Verifies a ReferenceCursor message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a ReferenceCursor message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ReferenceCursor
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.ReferenceCursor;

    /**
     * Creates a plain object from a ReferenceCursor message. Also converts values to other types if specified.
     * @param message ReferenceCursor
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.ReferenceCursor,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ReferenceCursor to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ReferenceCursor
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a DebugReferenceDigestResult. */
  interface IDebugReferenceDigestResult {
    /** DebugReferenceDigestResult success */
    success?: boolean | null;

    /** DebugReferenceDigestResult pointerParsed */
    pointerParsed?: boolean | null;

    /** DebugReferenceDigestResult hasDigest */
    hasDigest?: boolean | null;

    /** DebugReferenceDigestResult referenceDigest */
    referenceDigest?: polycentric.IDigest | null;

    /** DebugReferenceDigestResult calculatedDigest */
    calculatedDigest?: polycentric.IDigest | null;

    /** DebugReferenceDigestResult digestsMatch */
    digestsMatch?: boolean | null;

    /** DebugReferenceDigestResult error */
    error?: string | null;

    /** DebugReferenceDigestResult referenceBytesLength */
    referenceBytesLength?: number | null;

    /** DebugReferenceDigestResult eventBytesLength */
    eventBytesLength?: number | null;

    /** DebugReferenceDigestResult pointerSystemPresent */
    pointerSystemPresent?: boolean | null;

    /** DebugReferenceDigestResult pointerProcessPresent */
    pointerProcessPresent?: boolean | null;

    /** DebugReferenceDigestResult pointerLogicalClock */
    pointerLogicalClock?: number | Long | null;
  }

  /** Represents a DebugReferenceDigestResult. */
  class DebugReferenceDigestResult implements IDebugReferenceDigestResult {
    /**
     * Constructs a new DebugReferenceDigestResult.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IDebugReferenceDigestResult);

    /** DebugReferenceDigestResult success. */
    public success: boolean;

    /** DebugReferenceDigestResult pointerParsed. */
    public pointerParsed: boolean;

    /** DebugReferenceDigestResult hasDigest. */
    public hasDigest: boolean;

    /** DebugReferenceDigestResult referenceDigest. */
    public referenceDigest?: polycentric.IDigest | null;

    /** DebugReferenceDigestResult calculatedDigest. */
    public calculatedDigest?: polycentric.IDigest | null;

    /** DebugReferenceDigestResult digestsMatch. */
    public digestsMatch: boolean;

    /** DebugReferenceDigestResult error. */
    public error: string;

    /** DebugReferenceDigestResult referenceBytesLength. */
    public referenceBytesLength: number;

    /** DebugReferenceDigestResult eventBytesLength. */
    public eventBytesLength: number;

    /** DebugReferenceDigestResult pointerSystemPresent. */
    public pointerSystemPresent: boolean;

    /** DebugReferenceDigestResult pointerProcessPresent. */
    public pointerProcessPresent: boolean;

    /** DebugReferenceDigestResult pointerLogicalClock. */
    public pointerLogicalClock: number | Long;

    /**
     * Creates a new DebugReferenceDigestResult instance using the specified properties.
     * @param [properties] Properties to set
     * @returns DebugReferenceDigestResult instance
     */
    public static create(
      properties?: polycentric.IDebugReferenceDigestResult
    ): polycentric.DebugReferenceDigestResult;

    /**
     * Encodes the specified DebugReferenceDigestResult message. Does not implicitly {@link polycentric.DebugReferenceDigestResult.verify|verify} messages.
     * @param message DebugReferenceDigestResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IDebugReferenceDigestResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified DebugReferenceDigestResult message, length delimited. Does not implicitly {@link polycentric.DebugReferenceDigestResult.verify|verify} messages.
     * @param message DebugReferenceDigestResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IDebugReferenceDigestResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a DebugReferenceDigestResult message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns DebugReferenceDigestResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.DebugReferenceDigestResult;

    /**
     * Decodes a DebugReferenceDigestResult message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns DebugReferenceDigestResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.DebugReferenceDigestResult;

    /**
     * Verifies a DebugReferenceDigestResult message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a DebugReferenceDigestResult message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns DebugReferenceDigestResult
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.DebugReferenceDigestResult;

    /**
     * Creates a plain object from a DebugReferenceDigestResult message. Also converts values to other types if specified.
     * @param message DebugReferenceDigestResult
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.DebugReferenceDigestResult,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this DebugReferenceDigestResult to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for DebugReferenceDigestResult
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a Server. */
  interface IServer {
    /** Server server */
    server?: string | null;
  }

  /** Represents a Server. */
  class Server implements IServer {
    /**
     * Constructs a new Server.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IServer);

    /** Server server. */
    public server: string;

    /**
     * Creates a new Server instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Server instance
     */
    public static create(properties?: polycentric.IServer): polycentric.Server;

    /**
     * Encodes the specified Server message. Does not implicitly {@link polycentric.Server.verify|verify} messages.
     * @param message Server message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IServer,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Server message, length delimited. Does not implicitly {@link polycentric.Server.verify|verify} messages.
     * @param message Server message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IServer,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a Server message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Server
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.Server;

    /**
     * Decodes a Server message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Server
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.Server;

    /**
     * Verifies a Server message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a Server message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Server
     */
    public static fromObject(object: { [k: string]: any }): polycentric.Server;

    /**
     * Creates a plain object from a Server message. Also converts values to other types if specified.
     * @param message Server
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.Server,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Server to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Server
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of an AggregationBucket. */
  interface IAggregationBucket {
    /** AggregationBucket key */
    key?: Uint8Array | null;

    /** AggregationBucket value */
    value?: number | Long | null;
  }

  /** Represents an AggregationBucket. */
  class AggregationBucket implements IAggregationBucket {
    /**
     * Constructs a new AggregationBucket.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IAggregationBucket);

    /** AggregationBucket key. */
    public key: Uint8Array;

    /** AggregationBucket value. */
    public value: number | Long;

    /**
     * Creates a new AggregationBucket instance using the specified properties.
     * @param [properties] Properties to set
     * @returns AggregationBucket instance
     */
    public static create(
      properties?: polycentric.IAggregationBucket
    ): polycentric.AggregationBucket;

    /**
     * Encodes the specified AggregationBucket message. Does not implicitly {@link polycentric.AggregationBucket.verify|verify} messages.
     * @param message AggregationBucket message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IAggregationBucket,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified AggregationBucket message, length delimited. Does not implicitly {@link polycentric.AggregationBucket.verify|verify} messages.
     * @param message AggregationBucket message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IAggregationBucket,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an AggregationBucket message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns AggregationBucket
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.AggregationBucket;

    /**
     * Decodes an AggregationBucket message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns AggregationBucket
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.AggregationBucket;

    /**
     * Verifies an AggregationBucket message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an AggregationBucket message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns AggregationBucket
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.AggregationBucket;

    /**
     * Creates a plain object from an AggregationBucket message. Also converts values to other types if specified.
     * @param message AggregationBucket
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.AggregationBucket,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this AggregationBucket to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for AggregationBucket
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a PublicKeys. */
  interface IPublicKeys {
    /** PublicKeys systems */
    systems?: polycentric.IPublicKey[] | null;
  }

  /** Represents a PublicKeys. */
  class PublicKeys implements IPublicKeys {
    /**
     * Constructs a new PublicKeys.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IPublicKeys);

    /** PublicKeys systems. */
    public systems: polycentric.IPublicKey[];

    /**
     * Creates a new PublicKeys instance using the specified properties.
     * @param [properties] Properties to set
     * @returns PublicKeys instance
     */
    public static create(
      properties?: polycentric.IPublicKeys
    ): polycentric.PublicKeys;

    /**
     * Encodes the specified PublicKeys message. Does not implicitly {@link polycentric.PublicKeys.verify|verify} messages.
     * @param message PublicKeys message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IPublicKeys,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified PublicKeys message, length delimited. Does not implicitly {@link polycentric.PublicKeys.verify|verify} messages.
     * @param message PublicKeys message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IPublicKeys,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a PublicKeys message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns PublicKeys
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.PublicKeys;

    /**
     * Decodes a PublicKeys message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns PublicKeys
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.PublicKeys;

    /**
     * Verifies a PublicKeys message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a PublicKeys message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns PublicKeys
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.PublicKeys;

    /**
     * Creates a plain object from a PublicKeys message. Also converts values to other types if specified.
     * @param message PublicKeys
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.PublicKeys,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this PublicKeys to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for PublicKeys
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a KeyPair. */
  interface IKeyPair {
    /** KeyPair keyType */
    keyType?: number | Long | null;

    /** KeyPair privateKey */
    privateKey?: Uint8Array | null;

    /** KeyPair publicKey */
    publicKey?: Uint8Array | null;
  }

  /** Represents a KeyPair. */
  class KeyPair implements IKeyPair {
    /**
     * Constructs a new KeyPair.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IKeyPair);

    /** KeyPair keyType. */
    public keyType: number | Long;

    /** KeyPair privateKey. */
    public privateKey: Uint8Array;

    /** KeyPair publicKey. */
    public publicKey: Uint8Array;

    /**
     * Creates a new KeyPair instance using the specified properties.
     * @param [properties] Properties to set
     * @returns KeyPair instance
     */
    public static create(
      properties?: polycentric.IKeyPair
    ): polycentric.KeyPair;

    /**
     * Encodes the specified KeyPair message. Does not implicitly {@link polycentric.KeyPair.verify|verify} messages.
     * @param message KeyPair message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IKeyPair,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified KeyPair message, length delimited. Does not implicitly {@link polycentric.KeyPair.verify|verify} messages.
     * @param message KeyPair message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IKeyPair,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a KeyPair message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns KeyPair
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.KeyPair;

    /**
     * Decodes a KeyPair message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns KeyPair
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.KeyPair;

    /**
     * Verifies a KeyPair message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a KeyPair message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns KeyPair
     */
    public static fromObject(object: { [k: string]: any }): polycentric.KeyPair;

    /**
     * Creates a plain object from a KeyPair message. Also converts values to other types if specified.
     * @param message KeyPair
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.KeyPair,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this KeyPair to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for KeyPair
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a ResultEventsAndRelatedEventsAndCursor. */
  interface IResultEventsAndRelatedEventsAndCursor {
    /** ResultEventsAndRelatedEventsAndCursor resultEvents */
    resultEvents?: polycentric.IEvents | null;

    /** ResultEventsAndRelatedEventsAndCursor relatedEvents */
    relatedEvents?: polycentric.IEvents | null;

    /** ResultEventsAndRelatedEventsAndCursor cursor */
    cursor?: Uint8Array | null;
  }

  /** Represents a ResultEventsAndRelatedEventsAndCursor. */
  class ResultEventsAndRelatedEventsAndCursor implements IResultEventsAndRelatedEventsAndCursor {
    /**
     * Constructs a new ResultEventsAndRelatedEventsAndCursor.
     * @param [properties] Properties to set
     */
    constructor(
      properties?: polycentric.IResultEventsAndRelatedEventsAndCursor
    );

    /** ResultEventsAndRelatedEventsAndCursor resultEvents. */
    public resultEvents?: polycentric.IEvents | null;

    /** ResultEventsAndRelatedEventsAndCursor relatedEvents. */
    public relatedEvents?: polycentric.IEvents | null;

    /** ResultEventsAndRelatedEventsAndCursor cursor. */
    public cursor?: Uint8Array | null;

    /**
     * Creates a new ResultEventsAndRelatedEventsAndCursor instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ResultEventsAndRelatedEventsAndCursor instance
     */
    public static create(
      properties?: polycentric.IResultEventsAndRelatedEventsAndCursor
    ): polycentric.ResultEventsAndRelatedEventsAndCursor;

    /**
     * Encodes the specified ResultEventsAndRelatedEventsAndCursor message. Does not implicitly {@link polycentric.ResultEventsAndRelatedEventsAndCursor.verify|verify} messages.
     * @param message ResultEventsAndRelatedEventsAndCursor message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IResultEventsAndRelatedEventsAndCursor,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ResultEventsAndRelatedEventsAndCursor message, length delimited. Does not implicitly {@link polycentric.ResultEventsAndRelatedEventsAndCursor.verify|verify} messages.
     * @param message ResultEventsAndRelatedEventsAndCursor message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IResultEventsAndRelatedEventsAndCursor,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a ResultEventsAndRelatedEventsAndCursor message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ResultEventsAndRelatedEventsAndCursor
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.ResultEventsAndRelatedEventsAndCursor;

    /**
     * Decodes a ResultEventsAndRelatedEventsAndCursor message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ResultEventsAndRelatedEventsAndCursor
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.ResultEventsAndRelatedEventsAndCursor;

    /**
     * Verifies a ResultEventsAndRelatedEventsAndCursor message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a ResultEventsAndRelatedEventsAndCursor message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ResultEventsAndRelatedEventsAndCursor
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.ResultEventsAndRelatedEventsAndCursor;

    /**
     * Creates a plain object from a ResultEventsAndRelatedEventsAndCursor message. Also converts values to other types if specified.
     * @param message ResultEventsAndRelatedEventsAndCursor
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.ResultEventsAndRelatedEventsAndCursor,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ResultEventsAndRelatedEventsAndCursor to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ResultEventsAndRelatedEventsAndCursor
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a ResultTopStringReferences. */
  interface IResultTopStringReferences {
    /** ResultTopStringReferences buckets */
    buckets?: polycentric.IAggregationBucket[] | null;
  }

  /** Represents a ResultTopStringReferences. */
  class ResultTopStringReferences implements IResultTopStringReferences {
    /**
     * Constructs a new ResultTopStringReferences.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IResultTopStringReferences);

    /** ResultTopStringReferences buckets. */
    public buckets: polycentric.IAggregationBucket[];

    /**
     * Creates a new ResultTopStringReferences instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ResultTopStringReferences instance
     */
    public static create(
      properties?: polycentric.IResultTopStringReferences
    ): polycentric.ResultTopStringReferences;

    /**
     * Encodes the specified ResultTopStringReferences message. Does not implicitly {@link polycentric.ResultTopStringReferences.verify|verify} messages.
     * @param message ResultTopStringReferences message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IResultTopStringReferences,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ResultTopStringReferences message, length delimited. Does not implicitly {@link polycentric.ResultTopStringReferences.verify|verify} messages.
     * @param message ResultTopStringReferences message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IResultTopStringReferences,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a ResultTopStringReferences message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ResultTopStringReferences
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.ResultTopStringReferences;

    /**
     * Decodes a ResultTopStringReferences message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ResultTopStringReferences
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.ResultTopStringReferences;

    /**
     * Verifies a ResultTopStringReferences message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a ResultTopStringReferences message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ResultTopStringReferences
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.ResultTopStringReferences;

    /**
     * Creates a plain object from a ResultTopStringReferences message. Also converts values to other types if specified.
     * @param message ResultTopStringReferences
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.ResultTopStringReferences,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ResultTopStringReferences to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ResultTopStringReferences
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a StorageTypeCRDTSetItem. */
  interface IStorageTypeCRDTSetItem {
    /** StorageTypeCRDTSetItem contentType */
    contentType?: number | Long | null;

    /** StorageTypeCRDTSetItem value */
    value?: Uint8Array | null;

    /** StorageTypeCRDTSetItem unixMilliseconds */
    unixMilliseconds?: number | Long | null;

    /** StorageTypeCRDTSetItem operation */
    operation?: polycentric.LWWElementSet.Operation | null;
  }

  /** Represents a StorageTypeCRDTSetItem. */
  class StorageTypeCRDTSetItem implements IStorageTypeCRDTSetItem {
    /**
     * Constructs a new StorageTypeCRDTSetItem.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IStorageTypeCRDTSetItem);

    /** StorageTypeCRDTSetItem contentType. */
    public contentType: number | Long;

    /** StorageTypeCRDTSetItem value. */
    public value: Uint8Array;

    /** StorageTypeCRDTSetItem unixMilliseconds. */
    public unixMilliseconds: number | Long;

    /** StorageTypeCRDTSetItem operation. */
    public operation: polycentric.LWWElementSet.Operation;

    /**
     * Creates a new StorageTypeCRDTSetItem instance using the specified properties.
     * @param [properties] Properties to set
     * @returns StorageTypeCRDTSetItem instance
     */
    public static create(
      properties?: polycentric.IStorageTypeCRDTSetItem
    ): polycentric.StorageTypeCRDTSetItem;

    /**
     * Encodes the specified StorageTypeCRDTSetItem message. Does not implicitly {@link polycentric.StorageTypeCRDTSetItem.verify|verify} messages.
     * @param message StorageTypeCRDTSetItem message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IStorageTypeCRDTSetItem,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified StorageTypeCRDTSetItem message, length delimited. Does not implicitly {@link polycentric.StorageTypeCRDTSetItem.verify|verify} messages.
     * @param message StorageTypeCRDTSetItem message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IStorageTypeCRDTSetItem,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a StorageTypeCRDTSetItem message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns StorageTypeCRDTSetItem
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.StorageTypeCRDTSetItem;

    /**
     * Decodes a StorageTypeCRDTSetItem message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns StorageTypeCRDTSetItem
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.StorageTypeCRDTSetItem;

    /**
     * Verifies a StorageTypeCRDTSetItem message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a StorageTypeCRDTSetItem message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns StorageTypeCRDTSetItem
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.StorageTypeCRDTSetItem;

    /**
     * Creates a plain object from a StorageTypeCRDTSetItem message. Also converts values to other types if specified.
     * @param message StorageTypeCRDTSetItem
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.StorageTypeCRDTSetItem,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this StorageTypeCRDTSetItem to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for StorageTypeCRDTSetItem
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a StorageTypeCRDTItem. */
  interface IStorageTypeCRDTItem {
    /** StorageTypeCRDTItem contentType */
    contentType?: number | Long | null;

    /** StorageTypeCRDTItem value */
    value?: Uint8Array | null;

    /** StorageTypeCRDTItem unixMilliseconds */
    unixMilliseconds?: number | Long | null;
  }

  /** Represents a StorageTypeCRDTItem. */
  class StorageTypeCRDTItem implements IStorageTypeCRDTItem {
    /**
     * Constructs a new StorageTypeCRDTItem.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IStorageTypeCRDTItem);

    /** StorageTypeCRDTItem contentType. */
    public contentType: number | Long;

    /** StorageTypeCRDTItem value. */
    public value: Uint8Array;

    /** StorageTypeCRDTItem unixMilliseconds. */
    public unixMilliseconds: number | Long;

    /**
     * Creates a new StorageTypeCRDTItem instance using the specified properties.
     * @param [properties] Properties to set
     * @returns StorageTypeCRDTItem instance
     */
    public static create(
      properties?: polycentric.IStorageTypeCRDTItem
    ): polycentric.StorageTypeCRDTItem;

    /**
     * Encodes the specified StorageTypeCRDTItem message. Does not implicitly {@link polycentric.StorageTypeCRDTItem.verify|verify} messages.
     * @param message StorageTypeCRDTItem message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IStorageTypeCRDTItem,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified StorageTypeCRDTItem message, length delimited. Does not implicitly {@link polycentric.StorageTypeCRDTItem.verify|verify} messages.
     * @param message StorageTypeCRDTItem message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IStorageTypeCRDTItem,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a StorageTypeCRDTItem message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns StorageTypeCRDTItem
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.StorageTypeCRDTItem;

    /**
     * Decodes a StorageTypeCRDTItem message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns StorageTypeCRDTItem
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.StorageTypeCRDTItem;

    /**
     * Verifies a StorageTypeCRDTItem message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a StorageTypeCRDTItem message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns StorageTypeCRDTItem
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.StorageTypeCRDTItem;

    /**
     * Creates a plain object from a StorageTypeCRDTItem message. Also converts values to other types if specified.
     * @param message StorageTypeCRDTItem
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.StorageTypeCRDTItem,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this StorageTypeCRDTItem to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for StorageTypeCRDTItem
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a StorageTypeProcessState. */
  interface IStorageTypeProcessState {
    /** StorageTypeProcessState logicalClock */
    logicalClock?: number | Long | null;

    /** StorageTypeProcessState ranges */
    ranges?: polycentric.IRange[] | null;

    /** StorageTypeProcessState indices */
    indices?: polycentric.IIndices | null;
  }

  /** Represents a StorageTypeProcessState. */
  class StorageTypeProcessState implements IStorageTypeProcessState {
    /**
     * Constructs a new StorageTypeProcessState.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IStorageTypeProcessState);

    /** StorageTypeProcessState logicalClock. */
    public logicalClock: number | Long;

    /** StorageTypeProcessState ranges. */
    public ranges: polycentric.IRange[];

    /** StorageTypeProcessState indices. */
    public indices?: polycentric.IIndices | null;

    /**
     * Creates a new StorageTypeProcessState instance using the specified properties.
     * @param [properties] Properties to set
     * @returns StorageTypeProcessState instance
     */
    public static create(
      properties?: polycentric.IStorageTypeProcessState
    ): polycentric.StorageTypeProcessState;

    /**
     * Encodes the specified StorageTypeProcessState message. Does not implicitly {@link polycentric.StorageTypeProcessState.verify|verify} messages.
     * @param message StorageTypeProcessState message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IStorageTypeProcessState,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified StorageTypeProcessState message, length delimited. Does not implicitly {@link polycentric.StorageTypeProcessState.verify|verify} messages.
     * @param message StorageTypeProcessState message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IStorageTypeProcessState,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a StorageTypeProcessState message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns StorageTypeProcessState
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.StorageTypeProcessState;

    /**
     * Decodes a StorageTypeProcessState message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns StorageTypeProcessState
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.StorageTypeProcessState;

    /**
     * Verifies a StorageTypeProcessState message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a StorageTypeProcessState message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns StorageTypeProcessState
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.StorageTypeProcessState;

    /**
     * Creates a plain object from a StorageTypeProcessState message. Also converts values to other types if specified.
     * @param message StorageTypeProcessState
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.StorageTypeProcessState,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this StorageTypeProcessState to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for StorageTypeProcessState
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a RepeatedUInt64. */
  interface IRepeatedUInt64 {
    /** RepeatedUInt64 numbers */
    numbers?: (number | Long)[] | null;
  }

  /** Represents a RepeatedUInt64. */
  class RepeatedUInt64 implements IRepeatedUInt64 {
    /**
     * Constructs a new RepeatedUInt64.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IRepeatedUInt64);

    /** RepeatedUInt64 numbers. */
    public numbers: (number | Long)[];

    /**
     * Creates a new RepeatedUInt64 instance using the specified properties.
     * @param [properties] Properties to set
     * @returns RepeatedUInt64 instance
     */
    public static create(
      properties?: polycentric.IRepeatedUInt64
    ): polycentric.RepeatedUInt64;

    /**
     * Encodes the specified RepeatedUInt64 message. Does not implicitly {@link polycentric.RepeatedUInt64.verify|verify} messages.
     * @param message RepeatedUInt64 message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IRepeatedUInt64,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified RepeatedUInt64 message, length delimited. Does not implicitly {@link polycentric.RepeatedUInt64.verify|verify} messages.
     * @param message RepeatedUInt64 message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IRepeatedUInt64,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a RepeatedUInt64 message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns RepeatedUInt64
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.RepeatedUInt64;

    /**
     * Decodes a RepeatedUInt64 message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns RepeatedUInt64
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.RepeatedUInt64;

    /**
     * Verifies a RepeatedUInt64 message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a RepeatedUInt64 message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns RepeatedUInt64
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.RepeatedUInt64;

    /**
     * Creates a plain object from a RepeatedUInt64 message. Also converts values to other types if specified.
     * @param message RepeatedUInt64
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.RepeatedUInt64,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this RepeatedUInt64 to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for RepeatedUInt64
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a QueryReferencesRequest. */
  interface IQueryReferencesRequest {
    /** QueryReferencesRequest reference */
    reference?: polycentric.IReference | null;

    /** QueryReferencesRequest cursor */
    cursor?: Uint8Array | null;

    /** QueryReferencesRequest requestEvents */
    requestEvents?: polycentric.IQueryReferencesRequestEvents | null;

    /** QueryReferencesRequest countLwwElementReferences */
    countLwwElementReferences?:
      | polycentric.IQueryReferencesRequestCountLWWElementReferences[]
      | null;

    /** QueryReferencesRequest countReferences */
    countReferences?:
      | polycentric.IQueryReferencesRequestCountReferences[]
      | null;

    /** QueryReferencesRequest extraByteReferences */
    extraByteReferences?: Uint8Array[] | null;
  }

  /** Represents a QueryReferencesRequest. */
  class QueryReferencesRequest implements IQueryReferencesRequest {
    /**
     * Constructs a new QueryReferencesRequest.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IQueryReferencesRequest);

    /** QueryReferencesRequest reference. */
    public reference?: polycentric.IReference | null;

    /** QueryReferencesRequest cursor. */
    public cursor?: Uint8Array | null;

    /** QueryReferencesRequest requestEvents. */
    public requestEvents?: polycentric.IQueryReferencesRequestEvents | null;

    /** QueryReferencesRequest countLwwElementReferences. */
    public countLwwElementReferences: polycentric.IQueryReferencesRequestCountLWWElementReferences[];

    /** QueryReferencesRequest countReferences. */
    public countReferences: polycentric.IQueryReferencesRequestCountReferences[];

    /** QueryReferencesRequest extraByteReferences. */
    public extraByteReferences: Uint8Array[];

    /**
     * Creates a new QueryReferencesRequest instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryReferencesRequest instance
     */
    public static create(
      properties?: polycentric.IQueryReferencesRequest
    ): polycentric.QueryReferencesRequest;

    /**
     * Encodes the specified QueryReferencesRequest message. Does not implicitly {@link polycentric.QueryReferencesRequest.verify|verify} messages.
     * @param message QueryReferencesRequest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IQueryReferencesRequest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified QueryReferencesRequest message, length delimited. Does not implicitly {@link polycentric.QueryReferencesRequest.verify|verify} messages.
     * @param message QueryReferencesRequest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IQueryReferencesRequest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a QueryReferencesRequest message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryReferencesRequest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.QueryReferencesRequest;

    /**
     * Decodes a QueryReferencesRequest message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryReferencesRequest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.QueryReferencesRequest;

    /**
     * Verifies a QueryReferencesRequest message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a QueryReferencesRequest message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryReferencesRequest
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.QueryReferencesRequest;

    /**
     * Creates a plain object from a QueryReferencesRequest message. Also converts values to other types if specified.
     * @param message QueryReferencesRequest
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.QueryReferencesRequest,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this QueryReferencesRequest to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryReferencesRequest
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a QueryReferencesRequestEvents. */
  interface IQueryReferencesRequestEvents {
    /** QueryReferencesRequestEvents fromType */
    fromType?: number | Long | null;

    /** QueryReferencesRequestEvents countLwwElementReferences */
    countLwwElementReferences?:
      | polycentric.IQueryReferencesRequestCountLWWElementReferences[]
      | null;

    /** QueryReferencesRequestEvents countReferences */
    countReferences?:
      | polycentric.IQueryReferencesRequestCountReferences[]
      | null;
  }

  /** Represents a QueryReferencesRequestEvents. */
  class QueryReferencesRequestEvents implements IQueryReferencesRequestEvents {
    /**
     * Constructs a new QueryReferencesRequestEvents.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IQueryReferencesRequestEvents);

    /** QueryReferencesRequestEvents fromType. */
    public fromType?: number | Long | null;

    /** QueryReferencesRequestEvents countLwwElementReferences. */
    public countLwwElementReferences: polycentric.IQueryReferencesRequestCountLWWElementReferences[];

    /** QueryReferencesRequestEvents countReferences. */
    public countReferences: polycentric.IQueryReferencesRequestCountReferences[];

    /**
     * Creates a new QueryReferencesRequestEvents instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryReferencesRequestEvents instance
     */
    public static create(
      properties?: polycentric.IQueryReferencesRequestEvents
    ): polycentric.QueryReferencesRequestEvents;

    /**
     * Encodes the specified QueryReferencesRequestEvents message. Does not implicitly {@link polycentric.QueryReferencesRequestEvents.verify|verify} messages.
     * @param message QueryReferencesRequestEvents message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IQueryReferencesRequestEvents,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified QueryReferencesRequestEvents message, length delimited. Does not implicitly {@link polycentric.QueryReferencesRequestEvents.verify|verify} messages.
     * @param message QueryReferencesRequestEvents message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IQueryReferencesRequestEvents,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a QueryReferencesRequestEvents message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryReferencesRequestEvents
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.QueryReferencesRequestEvents;

    /**
     * Decodes a QueryReferencesRequestEvents message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryReferencesRequestEvents
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.QueryReferencesRequestEvents;

    /**
     * Verifies a QueryReferencesRequestEvents message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a QueryReferencesRequestEvents message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryReferencesRequestEvents
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.QueryReferencesRequestEvents;

    /**
     * Creates a plain object from a QueryReferencesRequestEvents message. Also converts values to other types if specified.
     * @param message QueryReferencesRequestEvents
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.QueryReferencesRequestEvents,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this QueryReferencesRequestEvents to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryReferencesRequestEvents
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a QueryReferencesRequestCountLWWElementReferences. */
  interface IQueryReferencesRequestCountLWWElementReferences {
    /** QueryReferencesRequestCountLWWElementReferences value */
    value?: Uint8Array | null;

    /** QueryReferencesRequestCountLWWElementReferences fromType */
    fromType?: number | Long | null;
  }

  /** Represents a QueryReferencesRequestCountLWWElementReferences. */
  class QueryReferencesRequestCountLWWElementReferences implements IQueryReferencesRequestCountLWWElementReferences {
    /**
     * Constructs a new QueryReferencesRequestCountLWWElementReferences.
     * @param [properties] Properties to set
     */
    constructor(
      properties?: polycentric.IQueryReferencesRequestCountLWWElementReferences
    );

    /** QueryReferencesRequestCountLWWElementReferences value. */
    public value: Uint8Array;

    /** QueryReferencesRequestCountLWWElementReferences fromType. */
    public fromType?: number | Long | null;

    /**
     * Creates a new QueryReferencesRequestCountLWWElementReferences instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryReferencesRequestCountLWWElementReferences instance
     */
    public static create(
      properties?: polycentric.IQueryReferencesRequestCountLWWElementReferences
    ): polycentric.QueryReferencesRequestCountLWWElementReferences;

    /**
     * Encodes the specified QueryReferencesRequestCountLWWElementReferences message. Does not implicitly {@link polycentric.QueryReferencesRequestCountLWWElementReferences.verify|verify} messages.
     * @param message QueryReferencesRequestCountLWWElementReferences message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IQueryReferencesRequestCountLWWElementReferences,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified QueryReferencesRequestCountLWWElementReferences message, length delimited. Does not implicitly {@link polycentric.QueryReferencesRequestCountLWWElementReferences.verify|verify} messages.
     * @param message QueryReferencesRequestCountLWWElementReferences message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IQueryReferencesRequestCountLWWElementReferences,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a QueryReferencesRequestCountLWWElementReferences message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryReferencesRequestCountLWWElementReferences
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.QueryReferencesRequestCountLWWElementReferences;

    /**
     * Decodes a QueryReferencesRequestCountLWWElementReferences message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryReferencesRequestCountLWWElementReferences
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.QueryReferencesRequestCountLWWElementReferences;

    /**
     * Verifies a QueryReferencesRequestCountLWWElementReferences message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a QueryReferencesRequestCountLWWElementReferences message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryReferencesRequestCountLWWElementReferences
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.QueryReferencesRequestCountLWWElementReferences;

    /**
     * Creates a plain object from a QueryReferencesRequestCountLWWElementReferences message. Also converts values to other types if specified.
     * @param message QueryReferencesRequestCountLWWElementReferences
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.QueryReferencesRequestCountLWWElementReferences,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this QueryReferencesRequestCountLWWElementReferences to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryReferencesRequestCountLWWElementReferences
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a QueryReferencesRequestCountReferences. */
  interface IQueryReferencesRequestCountReferences {
    /** QueryReferencesRequestCountReferences fromType */
    fromType?: number | Long | null;
  }

  /** Represents a QueryReferencesRequestCountReferences. */
  class QueryReferencesRequestCountReferences implements IQueryReferencesRequestCountReferences {
    /**
     * Constructs a new QueryReferencesRequestCountReferences.
     * @param [properties] Properties to set
     */
    constructor(
      properties?: polycentric.IQueryReferencesRequestCountReferences
    );

    /** QueryReferencesRequestCountReferences fromType. */
    public fromType?: number | Long | null;

    /**
     * Creates a new QueryReferencesRequestCountReferences instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryReferencesRequestCountReferences instance
     */
    public static create(
      properties?: polycentric.IQueryReferencesRequestCountReferences
    ): polycentric.QueryReferencesRequestCountReferences;

    /**
     * Encodes the specified QueryReferencesRequestCountReferences message. Does not implicitly {@link polycentric.QueryReferencesRequestCountReferences.verify|verify} messages.
     * @param message QueryReferencesRequestCountReferences message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IQueryReferencesRequestCountReferences,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified QueryReferencesRequestCountReferences message, length delimited. Does not implicitly {@link polycentric.QueryReferencesRequestCountReferences.verify|verify} messages.
     * @param message QueryReferencesRequestCountReferences message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IQueryReferencesRequestCountReferences,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a QueryReferencesRequestCountReferences message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryReferencesRequestCountReferences
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.QueryReferencesRequestCountReferences;

    /**
     * Decodes a QueryReferencesRequestCountReferences message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryReferencesRequestCountReferences
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.QueryReferencesRequestCountReferences;

    /**
     * Verifies a QueryReferencesRequestCountReferences message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a QueryReferencesRequestCountReferences message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryReferencesRequestCountReferences
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.QueryReferencesRequestCountReferences;

    /**
     * Creates a plain object from a QueryReferencesRequestCountReferences message. Also converts values to other types if specified.
     * @param message QueryReferencesRequestCountReferences
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.QueryReferencesRequestCountReferences,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this QueryReferencesRequestCountReferences to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryReferencesRequestCountReferences
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a QueryReferencesResponseEventItem. */
  interface IQueryReferencesResponseEventItem {
    /** QueryReferencesResponseEventItem event */
    event?: polycentric.ISignedEvent | null;

    /** QueryReferencesResponseEventItem counts */
    counts?: (number | Long)[] | null;
  }

  /** Represents a QueryReferencesResponseEventItem. */
  class QueryReferencesResponseEventItem implements IQueryReferencesResponseEventItem {
    /**
     * Constructs a new QueryReferencesResponseEventItem.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IQueryReferencesResponseEventItem);

    /** QueryReferencesResponseEventItem event. */
    public event?: polycentric.ISignedEvent | null;

    /** QueryReferencesResponseEventItem counts. */
    public counts: (number | Long)[];

    /**
     * Creates a new QueryReferencesResponseEventItem instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryReferencesResponseEventItem instance
     */
    public static create(
      properties?: polycentric.IQueryReferencesResponseEventItem
    ): polycentric.QueryReferencesResponseEventItem;

    /**
     * Encodes the specified QueryReferencesResponseEventItem message. Does not implicitly {@link polycentric.QueryReferencesResponseEventItem.verify|verify} messages.
     * @param message QueryReferencesResponseEventItem message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IQueryReferencesResponseEventItem,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified QueryReferencesResponseEventItem message, length delimited. Does not implicitly {@link polycentric.QueryReferencesResponseEventItem.verify|verify} messages.
     * @param message QueryReferencesResponseEventItem message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IQueryReferencesResponseEventItem,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a QueryReferencesResponseEventItem message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryReferencesResponseEventItem
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.QueryReferencesResponseEventItem;

    /**
     * Decodes a QueryReferencesResponseEventItem message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryReferencesResponseEventItem
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.QueryReferencesResponseEventItem;

    /**
     * Verifies a QueryReferencesResponseEventItem message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a QueryReferencesResponseEventItem message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryReferencesResponseEventItem
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.QueryReferencesResponseEventItem;

    /**
     * Creates a plain object from a QueryReferencesResponseEventItem message. Also converts values to other types if specified.
     * @param message QueryReferencesResponseEventItem
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.QueryReferencesResponseEventItem,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this QueryReferencesResponseEventItem to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryReferencesResponseEventItem
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a QueryReferencesResponse. */
  interface IQueryReferencesResponse {
    /** QueryReferencesResponse items */
    items?: polycentric.IQueryReferencesResponseEventItem[] | null;

    /** QueryReferencesResponse relatedEvents */
    relatedEvents?: polycentric.ISignedEvent[] | null;

    /** QueryReferencesResponse cursor */
    cursor?: Uint8Array | null;

    /** QueryReferencesResponse counts */
    counts?: (number | Long)[] | null;
  }

  /** Represents a QueryReferencesResponse. */
  class QueryReferencesResponse implements IQueryReferencesResponse {
    /**
     * Constructs a new QueryReferencesResponse.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IQueryReferencesResponse);

    /** QueryReferencesResponse items. */
    public items: polycentric.IQueryReferencesResponseEventItem[];

    /** QueryReferencesResponse relatedEvents. */
    public relatedEvents: polycentric.ISignedEvent[];

    /** QueryReferencesResponse cursor. */
    public cursor?: Uint8Array | null;

    /** QueryReferencesResponse counts. */
    public counts: (number | Long)[];

    /**
     * Creates a new QueryReferencesResponse instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryReferencesResponse instance
     */
    public static create(
      properties?: polycentric.IQueryReferencesResponse
    ): polycentric.QueryReferencesResponse;

    /**
     * Encodes the specified QueryReferencesResponse message. Does not implicitly {@link polycentric.QueryReferencesResponse.verify|verify} messages.
     * @param message QueryReferencesResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IQueryReferencesResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified QueryReferencesResponse message, length delimited. Does not implicitly {@link polycentric.QueryReferencesResponse.verify|verify} messages.
     * @param message QueryReferencesResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IQueryReferencesResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a QueryReferencesResponse message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryReferencesResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.QueryReferencesResponse;

    /**
     * Decodes a QueryReferencesResponse message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryReferencesResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.QueryReferencesResponse;

    /**
     * Verifies a QueryReferencesResponse message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a QueryReferencesResponse message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryReferencesResponse
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.QueryReferencesResponse;

    /**
     * Creates a plain object from a QueryReferencesResponse message. Also converts values to other types if specified.
     * @param message QueryReferencesResponse
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.QueryReferencesResponse,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this QueryReferencesResponse to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryReferencesResponse
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a QueryClaimToSystemRequest. */
  interface IQueryClaimToSystemRequest {
    /** QueryClaimToSystemRequest claimType */
    claimType?: number | Long | null;

    /** QueryClaimToSystemRequest trustRoot */
    trustRoot?: polycentric.IPublicKey | null;

    /** QueryClaimToSystemRequest matchAnyField */
    matchAnyField?: string | null;

    /** QueryClaimToSystemRequest matchAllFields */
    matchAllFields?: polycentric.IQueryClaimToSystemRequestMatchAll | null;
  }

  /** Represents a QueryClaimToSystemRequest. */
  class QueryClaimToSystemRequest implements IQueryClaimToSystemRequest {
    /**
     * Constructs a new QueryClaimToSystemRequest.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IQueryClaimToSystemRequest);

    /** QueryClaimToSystemRequest claimType. */
    public claimType: number | Long;

    /** QueryClaimToSystemRequest trustRoot. */
    public trustRoot?: polycentric.IPublicKey | null;

    /** QueryClaimToSystemRequest matchAnyField. */
    public matchAnyField?: string | null;

    /** QueryClaimToSystemRequest matchAllFields. */
    public matchAllFields?: polycentric.IQueryClaimToSystemRequestMatchAll | null;

    /** QueryClaimToSystemRequest query. */
    public query?: 'matchAnyField' | 'matchAllFields';

    /**
     * Creates a new QueryClaimToSystemRequest instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryClaimToSystemRequest instance
     */
    public static create(
      properties?: polycentric.IQueryClaimToSystemRequest
    ): polycentric.QueryClaimToSystemRequest;

    /**
     * Encodes the specified QueryClaimToSystemRequest message. Does not implicitly {@link polycentric.QueryClaimToSystemRequest.verify|verify} messages.
     * @param message QueryClaimToSystemRequest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IQueryClaimToSystemRequest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified QueryClaimToSystemRequest message, length delimited. Does not implicitly {@link polycentric.QueryClaimToSystemRequest.verify|verify} messages.
     * @param message QueryClaimToSystemRequest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IQueryClaimToSystemRequest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a QueryClaimToSystemRequest message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryClaimToSystemRequest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.QueryClaimToSystemRequest;

    /**
     * Decodes a QueryClaimToSystemRequest message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryClaimToSystemRequest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.QueryClaimToSystemRequest;

    /**
     * Verifies a QueryClaimToSystemRequest message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a QueryClaimToSystemRequest message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryClaimToSystemRequest
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.QueryClaimToSystemRequest;

    /**
     * Creates a plain object from a QueryClaimToSystemRequest message. Also converts values to other types if specified.
     * @param message QueryClaimToSystemRequest
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.QueryClaimToSystemRequest,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this QueryClaimToSystemRequest to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryClaimToSystemRequest
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a QueryClaimToSystemRequestMatchAll. */
  interface IQueryClaimToSystemRequestMatchAll {
    /** QueryClaimToSystemRequestMatchAll fields */
    fields?: polycentric.IClaimFieldEntry[] | null;
  }

  /** Represents a QueryClaimToSystemRequestMatchAll. */
  class QueryClaimToSystemRequestMatchAll implements IQueryClaimToSystemRequestMatchAll {
    /**
     * Constructs a new QueryClaimToSystemRequestMatchAll.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IQueryClaimToSystemRequestMatchAll);

    /** QueryClaimToSystemRequestMatchAll fields. */
    public fields: polycentric.IClaimFieldEntry[];

    /**
     * Creates a new QueryClaimToSystemRequestMatchAll instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryClaimToSystemRequestMatchAll instance
     */
    public static create(
      properties?: polycentric.IQueryClaimToSystemRequestMatchAll
    ): polycentric.QueryClaimToSystemRequestMatchAll;

    /**
     * Encodes the specified QueryClaimToSystemRequestMatchAll message. Does not implicitly {@link polycentric.QueryClaimToSystemRequestMatchAll.verify|verify} messages.
     * @param message QueryClaimToSystemRequestMatchAll message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IQueryClaimToSystemRequestMatchAll,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified QueryClaimToSystemRequestMatchAll message, length delimited. Does not implicitly {@link polycentric.QueryClaimToSystemRequestMatchAll.verify|verify} messages.
     * @param message QueryClaimToSystemRequestMatchAll message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IQueryClaimToSystemRequestMatchAll,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a QueryClaimToSystemRequestMatchAll message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryClaimToSystemRequestMatchAll
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.QueryClaimToSystemRequestMatchAll;

    /**
     * Decodes a QueryClaimToSystemRequestMatchAll message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryClaimToSystemRequestMatchAll
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.QueryClaimToSystemRequestMatchAll;

    /**
     * Verifies a QueryClaimToSystemRequestMatchAll message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a QueryClaimToSystemRequestMatchAll message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryClaimToSystemRequestMatchAll
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.QueryClaimToSystemRequestMatchAll;

    /**
     * Creates a plain object from a QueryClaimToSystemRequestMatchAll message. Also converts values to other types if specified.
     * @param message QueryClaimToSystemRequestMatchAll
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.QueryClaimToSystemRequestMatchAll,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this QueryClaimToSystemRequestMatchAll to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryClaimToSystemRequestMatchAll
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a QueryClaimToSystemResponse. */
  interface IQueryClaimToSystemResponse {
    /** QueryClaimToSystemResponse matches */
    matches?: polycentric.IQueryClaimToSystemResponseMatch[] | null;
  }

  /** Represents a QueryClaimToSystemResponse. */
  class QueryClaimToSystemResponse implements IQueryClaimToSystemResponse {
    /**
     * Constructs a new QueryClaimToSystemResponse.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IQueryClaimToSystemResponse);

    /** QueryClaimToSystemResponse matches. */
    public matches: polycentric.IQueryClaimToSystemResponseMatch[];

    /**
     * Creates a new QueryClaimToSystemResponse instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryClaimToSystemResponse instance
     */
    public static create(
      properties?: polycentric.IQueryClaimToSystemResponse
    ): polycentric.QueryClaimToSystemResponse;

    /**
     * Encodes the specified QueryClaimToSystemResponse message. Does not implicitly {@link polycentric.QueryClaimToSystemResponse.verify|verify} messages.
     * @param message QueryClaimToSystemResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IQueryClaimToSystemResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified QueryClaimToSystemResponse message, length delimited. Does not implicitly {@link polycentric.QueryClaimToSystemResponse.verify|verify} messages.
     * @param message QueryClaimToSystemResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IQueryClaimToSystemResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a QueryClaimToSystemResponse message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryClaimToSystemResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.QueryClaimToSystemResponse;

    /**
     * Decodes a QueryClaimToSystemResponse message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryClaimToSystemResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.QueryClaimToSystemResponse;

    /**
     * Verifies a QueryClaimToSystemResponse message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a QueryClaimToSystemResponse message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryClaimToSystemResponse
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.QueryClaimToSystemResponse;

    /**
     * Creates a plain object from a QueryClaimToSystemResponse message. Also converts values to other types if specified.
     * @param message QueryClaimToSystemResponse
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.QueryClaimToSystemResponse,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this QueryClaimToSystemResponse to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryClaimToSystemResponse
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a QueryClaimToSystemResponseMatch. */
  interface IQueryClaimToSystemResponseMatch {
    /** QueryClaimToSystemResponseMatch claim */
    claim?: polycentric.ISignedEvent | null;

    /** QueryClaimToSystemResponseMatch proofChain */
    proofChain?: polycentric.ISignedEvent[] | null;
  }

  /** Represents a QueryClaimToSystemResponseMatch. */
  class QueryClaimToSystemResponseMatch implements IQueryClaimToSystemResponseMatch {
    /**
     * Constructs a new QueryClaimToSystemResponseMatch.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IQueryClaimToSystemResponseMatch);

    /** QueryClaimToSystemResponseMatch claim. */
    public claim?: polycentric.ISignedEvent | null;

    /** QueryClaimToSystemResponseMatch proofChain. */
    public proofChain: polycentric.ISignedEvent[];

    /**
     * Creates a new QueryClaimToSystemResponseMatch instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryClaimToSystemResponseMatch instance
     */
    public static create(
      properties?: polycentric.IQueryClaimToSystemResponseMatch
    ): polycentric.QueryClaimToSystemResponseMatch;

    /**
     * Encodes the specified QueryClaimToSystemResponseMatch message. Does not implicitly {@link polycentric.QueryClaimToSystemResponseMatch.verify|verify} messages.
     * @param message QueryClaimToSystemResponseMatch message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IQueryClaimToSystemResponseMatch,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified QueryClaimToSystemResponseMatch message, length delimited. Does not implicitly {@link polycentric.QueryClaimToSystemResponseMatch.verify|verify} messages.
     * @param message QueryClaimToSystemResponseMatch message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IQueryClaimToSystemResponseMatch,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a QueryClaimToSystemResponseMatch message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryClaimToSystemResponseMatch
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.QueryClaimToSystemResponseMatch;

    /**
     * Decodes a QueryClaimToSystemResponseMatch message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryClaimToSystemResponseMatch
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.QueryClaimToSystemResponseMatch;

    /**
     * Verifies a QueryClaimToSystemResponseMatch message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a QueryClaimToSystemResponseMatch message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryClaimToSystemResponseMatch
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.QueryClaimToSystemResponseMatch;

    /**
     * Creates a plain object from a QueryClaimToSystemResponseMatch message. Also converts values to other types if specified.
     * @param message QueryClaimToSystemResponseMatch
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.QueryClaimToSystemResponseMatch,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this QueryClaimToSystemResponseMatch to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryClaimToSystemResponseMatch
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a QueryIndexResponse. */
  interface IQueryIndexResponse {
    /** QueryIndexResponse events */
    events?: polycentric.ISignedEvent[] | null;

    /** QueryIndexResponse proof */
    proof?: polycentric.ISignedEvent[] | null;
  }

  /** Represents a QueryIndexResponse. */
  class QueryIndexResponse implements IQueryIndexResponse {
    /**
     * Constructs a new QueryIndexResponse.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IQueryIndexResponse);

    /** QueryIndexResponse events. */
    public events: polycentric.ISignedEvent[];

    /** QueryIndexResponse proof. */
    public proof: polycentric.ISignedEvent[];

    /**
     * Creates a new QueryIndexResponse instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryIndexResponse instance
     */
    public static create(
      properties?: polycentric.IQueryIndexResponse
    ): polycentric.QueryIndexResponse;

    /**
     * Encodes the specified QueryIndexResponse message. Does not implicitly {@link polycentric.QueryIndexResponse.verify|verify} messages.
     * @param message QueryIndexResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IQueryIndexResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified QueryIndexResponse message, length delimited. Does not implicitly {@link polycentric.QueryIndexResponse.verify|verify} messages.
     * @param message QueryIndexResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IQueryIndexResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a QueryIndexResponse message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryIndexResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.QueryIndexResponse;

    /**
     * Decodes a QueryIndexResponse message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryIndexResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.QueryIndexResponse;

    /**
     * Verifies a QueryIndexResponse message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a QueryIndexResponse message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryIndexResponse
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.QueryIndexResponse;

    /**
     * Creates a plain object from a QueryIndexResponse message. Also converts values to other types if specified.
     * @param message QueryIndexResponse
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.QueryIndexResponse,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this QueryIndexResponse to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryIndexResponse
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a URLInfoDataLink. */
  interface IURLInfoDataLink {
    /** URLInfoDataLink system */
    system?: polycentric.IPublicKey | null;

    /** URLInfoDataLink process */
    process?: polycentric.IProcess | null;

    /** URLInfoDataLink servers */
    servers?: string[] | null;

    /** URLInfoDataLink byteCount */
    byteCount?: number | Long | null;

    /** URLInfoDataLink sections */
    sections?: polycentric.IRange[] | null;

    /** URLInfoDataLink mime */
    mime?: string | null;
  }

  /** Represents a URLInfoDataLink. */
  class URLInfoDataLink implements IURLInfoDataLink {
    /**
     * Constructs a new URLInfoDataLink.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IURLInfoDataLink);

    /** URLInfoDataLink system. */
    public system?: polycentric.IPublicKey | null;

    /** URLInfoDataLink process. */
    public process?: polycentric.IProcess | null;

    /** URLInfoDataLink servers. */
    public servers: string[];

    /** URLInfoDataLink byteCount. */
    public byteCount: number | Long;

    /** URLInfoDataLink sections. */
    public sections: polycentric.IRange[];

    /** URLInfoDataLink mime. */
    public mime?: string | null;

    /**
     * Creates a new URLInfoDataLink instance using the specified properties.
     * @param [properties] Properties to set
     * @returns URLInfoDataLink instance
     */
    public static create(
      properties?: polycentric.IURLInfoDataLink
    ): polycentric.URLInfoDataLink;

    /**
     * Encodes the specified URLInfoDataLink message. Does not implicitly {@link polycentric.URLInfoDataLink.verify|verify} messages.
     * @param message URLInfoDataLink message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IURLInfoDataLink,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified URLInfoDataLink message, length delimited. Does not implicitly {@link polycentric.URLInfoDataLink.verify|verify} messages.
     * @param message URLInfoDataLink message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IURLInfoDataLink,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a URLInfoDataLink message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns URLInfoDataLink
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.URLInfoDataLink;

    /**
     * Decodes a URLInfoDataLink message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns URLInfoDataLink
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.URLInfoDataLink;

    /**
     * Verifies a URLInfoDataLink message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a URLInfoDataLink message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns URLInfoDataLink
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.URLInfoDataLink;

    /**
     * Creates a plain object from a URLInfoDataLink message. Also converts values to other types if specified.
     * @param message URLInfoDataLink
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.URLInfoDataLink,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this URLInfoDataLink to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for URLInfoDataLink
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a FindClaimAndVouchRequest. */
  interface IFindClaimAndVouchRequest {
    /** FindClaimAndVouchRequest vouchingSystem */
    vouchingSystem?: polycentric.IPublicKey | null;

    /** FindClaimAndVouchRequest claimingSystem */
    claimingSystem?: polycentric.IPublicKey | null;

    /** FindClaimAndVouchRequest fields */
    fields?: polycentric.IClaimFieldEntry[] | null;

    /** FindClaimAndVouchRequest claimType */
    claimType?: number | Long | null;
  }

  /** Represents a FindClaimAndVouchRequest. */
  class FindClaimAndVouchRequest implements IFindClaimAndVouchRequest {
    /**
     * Constructs a new FindClaimAndVouchRequest.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IFindClaimAndVouchRequest);

    /** FindClaimAndVouchRequest vouchingSystem. */
    public vouchingSystem?: polycentric.IPublicKey | null;

    /** FindClaimAndVouchRequest claimingSystem. */
    public claimingSystem?: polycentric.IPublicKey | null;

    /** FindClaimAndVouchRequest fields. */
    public fields: polycentric.IClaimFieldEntry[];

    /** FindClaimAndVouchRequest claimType. */
    public claimType: number | Long;

    /**
     * Creates a new FindClaimAndVouchRequest instance using the specified properties.
     * @param [properties] Properties to set
     * @returns FindClaimAndVouchRequest instance
     */
    public static create(
      properties?: polycentric.IFindClaimAndVouchRequest
    ): polycentric.FindClaimAndVouchRequest;

    /**
     * Encodes the specified FindClaimAndVouchRequest message. Does not implicitly {@link polycentric.FindClaimAndVouchRequest.verify|verify} messages.
     * @param message FindClaimAndVouchRequest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IFindClaimAndVouchRequest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified FindClaimAndVouchRequest message, length delimited. Does not implicitly {@link polycentric.FindClaimAndVouchRequest.verify|verify} messages.
     * @param message FindClaimAndVouchRequest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IFindClaimAndVouchRequest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a FindClaimAndVouchRequest message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns FindClaimAndVouchRequest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.FindClaimAndVouchRequest;

    /**
     * Decodes a FindClaimAndVouchRequest message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns FindClaimAndVouchRequest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.FindClaimAndVouchRequest;

    /**
     * Verifies a FindClaimAndVouchRequest message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a FindClaimAndVouchRequest message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns FindClaimAndVouchRequest
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.FindClaimAndVouchRequest;

    /**
     * Creates a plain object from a FindClaimAndVouchRequest message. Also converts values to other types if specified.
     * @param message FindClaimAndVouchRequest
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.FindClaimAndVouchRequest,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this FindClaimAndVouchRequest to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for FindClaimAndVouchRequest
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a FindClaimAndVouchResponse. */
  interface IFindClaimAndVouchResponse {
    /** FindClaimAndVouchResponse vouch */
    vouch?: polycentric.ISignedEvent | null;

    /** FindClaimAndVouchResponse claim */
    claim?: polycentric.ISignedEvent | null;
  }

  /** Represents a FindClaimAndVouchResponse. */
  class FindClaimAndVouchResponse implements IFindClaimAndVouchResponse {
    /**
     * Constructs a new FindClaimAndVouchResponse.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IFindClaimAndVouchResponse);

    /** FindClaimAndVouchResponse vouch. */
    public vouch?: polycentric.ISignedEvent | null;

    /** FindClaimAndVouchResponse claim. */
    public claim?: polycentric.ISignedEvent | null;

    /**
     * Creates a new FindClaimAndVouchResponse instance using the specified properties.
     * @param [properties] Properties to set
     * @returns FindClaimAndVouchResponse instance
     */
    public static create(
      properties?: polycentric.IFindClaimAndVouchResponse
    ): polycentric.FindClaimAndVouchResponse;

    /**
     * Encodes the specified FindClaimAndVouchResponse message. Does not implicitly {@link polycentric.FindClaimAndVouchResponse.verify|verify} messages.
     * @param message FindClaimAndVouchResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IFindClaimAndVouchResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified FindClaimAndVouchResponse message, length delimited. Does not implicitly {@link polycentric.FindClaimAndVouchResponse.verify|verify} messages.
     * @param message FindClaimAndVouchResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IFindClaimAndVouchResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a FindClaimAndVouchResponse message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns FindClaimAndVouchResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.FindClaimAndVouchResponse;

    /**
     * Decodes a FindClaimAndVouchResponse message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns FindClaimAndVouchResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.FindClaimAndVouchResponse;

    /**
     * Verifies a FindClaimAndVouchResponse message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a FindClaimAndVouchResponse message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns FindClaimAndVouchResponse
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.FindClaimAndVouchResponse;

    /**
     * Creates a plain object from a FindClaimAndVouchResponse message. Also converts values to other types if specified.
     * @param message FindClaimAndVouchResponse
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.FindClaimAndVouchResponse,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this FindClaimAndVouchResponse to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for FindClaimAndVouchResponse
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a ClaimHandleRequest. */
  interface IClaimHandleRequest {
    /** ClaimHandleRequest system */
    system?: polycentric.IPublicKey | null;

    /** ClaimHandleRequest handle */
    handle?: string | null;
  }

  /** Represents a ClaimHandleRequest. */
  class ClaimHandleRequest implements IClaimHandleRequest {
    /**
     * Constructs a new ClaimHandleRequest.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric.IClaimHandleRequest);

    /** ClaimHandleRequest system. */
    public system?: polycentric.IPublicKey | null;

    /** ClaimHandleRequest handle. */
    public handle: string;

    /**
     * Creates a new ClaimHandleRequest instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ClaimHandleRequest instance
     */
    public static create(
      properties?: polycentric.IClaimHandleRequest
    ): polycentric.ClaimHandleRequest;

    /**
     * Encodes the specified ClaimHandleRequest message. Does not implicitly {@link polycentric.ClaimHandleRequest.verify|verify} messages.
     * @param message ClaimHandleRequest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric.IClaimHandleRequest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ClaimHandleRequest message, length delimited. Does not implicitly {@link polycentric.ClaimHandleRequest.verify|verify} messages.
     * @param message ClaimHandleRequest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric.IClaimHandleRequest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a ClaimHandleRequest message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ClaimHandleRequest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric.ClaimHandleRequest;

    /**
     * Decodes a ClaimHandleRequest message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ClaimHandleRequest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric.ClaimHandleRequest;

    /**
     * Verifies a ClaimHandleRequest message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a ClaimHandleRequest message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ClaimHandleRequest
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric.ClaimHandleRequest;

    /**
     * Creates a plain object from a ClaimHandleRequest message. Also converts values to other types if specified.
     * @param message ClaimHandleRequest
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric.ClaimHandleRequest,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ClaimHandleRequest to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ClaimHandleRequest
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }
}

/** Namespace polycentric_ffi. */
export namespace polycentric_ffi {
  /** Properties of a NetworkRequest. */
  interface INetworkRequest {
    /** NetworkRequest server */
    server?: string | null;

    /** NetworkRequest method */
    method?: string | null;

    /** NetworkRequest endpoint */
    endpoint?: string | null;

    /** NetworkRequest parameters */
    parameters?: { [k: string]: string } | null;

    /** NetworkRequest body */
    body?: Uint8Array | null;
  }

  /** Represents a NetworkRequest. */
  class NetworkRequest implements INetworkRequest {
    /**
     * Constructs a new NetworkRequest.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.INetworkRequest);

    /** NetworkRequest server. */
    public server: string;

    /** NetworkRequest method. */
    public method: string;

    /** NetworkRequest endpoint. */
    public endpoint: string;

    /** NetworkRequest parameters. */
    public parameters: { [k: string]: string };

    /** NetworkRequest body. */
    public body?: Uint8Array | null;

    /**
     * Creates a new NetworkRequest instance using the specified properties.
     * @param [properties] Properties to set
     * @returns NetworkRequest instance
     */
    public static create(
      properties?: polycentric_ffi.INetworkRequest
    ): polycentric_ffi.NetworkRequest;

    /**
     * Encodes the specified NetworkRequest message. Does not implicitly {@link polycentric_ffi.NetworkRequest.verify|verify} messages.
     * @param message NetworkRequest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.INetworkRequest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified NetworkRequest message, length delimited. Does not implicitly {@link polycentric_ffi.NetworkRequest.verify|verify} messages.
     * @param message NetworkRequest message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.INetworkRequest,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a NetworkRequest message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns NetworkRequest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.NetworkRequest;

    /**
     * Decodes a NetworkRequest message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns NetworkRequest
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.NetworkRequest;

    /**
     * Verifies a NetworkRequest message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a NetworkRequest message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns NetworkRequest
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.NetworkRequest;

    /**
     * Creates a plain object from a NetworkRequest message. Also converts values to other types if specified.
     * @param message NetworkRequest
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.NetworkRequest,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this NetworkRequest to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for NetworkRequest
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a NetworkResponse. */
  interface INetworkResponse {
    /** NetworkResponse body */
    body?: Uint8Array | null;
  }

  /** Represents a NetworkResponse. */
  class NetworkResponse implements INetworkResponse {
    /**
     * Constructs a new NetworkResponse.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.INetworkResponse);

    /** NetworkResponse body. */
    public body?: Uint8Array | null;

    /**
     * Creates a new NetworkResponse instance using the specified properties.
     * @param [properties] Properties to set
     * @returns NetworkResponse instance
     */
    public static create(
      properties?: polycentric_ffi.INetworkResponse
    ): polycentric_ffi.NetworkResponse;

    /**
     * Encodes the specified NetworkResponse message. Does not implicitly {@link polycentric_ffi.NetworkResponse.verify|verify} messages.
     * @param message NetworkResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.INetworkResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified NetworkResponse message, length delimited. Does not implicitly {@link polycentric_ffi.NetworkResponse.verify|verify} messages.
     * @param message NetworkResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.INetworkResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a NetworkResponse message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns NetworkResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.NetworkResponse;

    /**
     * Decodes a NetworkResponse message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns NetworkResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.NetworkResponse;

    /**
     * Verifies a NetworkResponse message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a NetworkResponse message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns NetworkResponse
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.NetworkResponse;

    /**
     * Creates a plain object from a NetworkResponse message. Also converts values to other types if specified.
     * @param message NetworkResponse
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.NetworkResponse,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this NetworkResponse to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for NetworkResponse
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a NetworkRequestResponses. */
  interface INetworkRequestResponses {
    /** NetworkRequestResponses pairs */
    pairs?: polycentric_ffi.INetworkRequestResponse[] | null;
  }

  /** Represents a NetworkRequestResponses. */
  class NetworkRequestResponses implements INetworkRequestResponses {
    /**
     * Constructs a new NetworkRequestResponses.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.INetworkRequestResponses);

    /** NetworkRequestResponses pairs. */
    public pairs: polycentric_ffi.INetworkRequestResponse[];

    /**
     * Creates a new NetworkRequestResponses instance using the specified properties.
     * @param [properties] Properties to set
     * @returns NetworkRequestResponses instance
     */
    public static create(
      properties?: polycentric_ffi.INetworkRequestResponses
    ): polycentric_ffi.NetworkRequestResponses;

    /**
     * Encodes the specified NetworkRequestResponses message. Does not implicitly {@link polycentric_ffi.NetworkRequestResponses.verify|verify} messages.
     * @param message NetworkRequestResponses message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.INetworkRequestResponses,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified NetworkRequestResponses message, length delimited. Does not implicitly {@link polycentric_ffi.NetworkRequestResponses.verify|verify} messages.
     * @param message NetworkRequestResponses message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.INetworkRequestResponses,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a NetworkRequestResponses message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns NetworkRequestResponses
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.NetworkRequestResponses;

    /**
     * Decodes a NetworkRequestResponses message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns NetworkRequestResponses
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.NetworkRequestResponses;

    /**
     * Verifies a NetworkRequestResponses message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a NetworkRequestResponses message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns NetworkRequestResponses
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.NetworkRequestResponses;

    /**
     * Creates a plain object from a NetworkRequestResponses message. Also converts values to other types if specified.
     * @param message NetworkRequestResponses
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.NetworkRequestResponses,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this NetworkRequestResponses to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for NetworkRequestResponses
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a NetworkRequestResponse. */
  interface INetworkRequestResponse {
    /** NetworkRequestResponse request */
    request?: polycentric_ffi.INetworkRequest | null;

    /** NetworkRequestResponse response */
    response?: polycentric_ffi.INetworkResponse | null;
  }

  /** Represents a NetworkRequestResponse. */
  class NetworkRequestResponse implements INetworkRequestResponse {
    /**
     * Constructs a new NetworkRequestResponse.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.INetworkRequestResponse);

    /** NetworkRequestResponse request. */
    public request?: polycentric_ffi.INetworkRequest | null;

    /** NetworkRequestResponse response. */
    public response?: polycentric_ffi.INetworkResponse | null;

    /**
     * Creates a new NetworkRequestResponse instance using the specified properties.
     * @param [properties] Properties to set
     * @returns NetworkRequestResponse instance
     */
    public static create(
      properties?: polycentric_ffi.INetworkRequestResponse
    ): polycentric_ffi.NetworkRequestResponse;

    /**
     * Encodes the specified NetworkRequestResponse message. Does not implicitly {@link polycentric_ffi.NetworkRequestResponse.verify|verify} messages.
     * @param message NetworkRequestResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.INetworkRequestResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified NetworkRequestResponse message, length delimited. Does not implicitly {@link polycentric_ffi.NetworkRequestResponse.verify|verify} messages.
     * @param message NetworkRequestResponse message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.INetworkRequestResponse,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a NetworkRequestResponse message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns NetworkRequestResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.NetworkRequestResponse;

    /**
     * Decodes a NetworkRequestResponse message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns NetworkRequestResponse
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.NetworkRequestResponse;

    /**
     * Verifies a NetworkRequestResponse message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a NetworkRequestResponse message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns NetworkRequestResponse
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.NetworkRequestResponse;

    /**
     * Creates a plain object from a NetworkRequestResponse message. Also converts values to other types if specified.
     * @param message NetworkRequestResponse
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.NetworkRequestResponse,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this NetworkRequestResponse to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for NetworkRequestResponse
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a Result. */
  interface IResult {
    /** Result requests */
    requests?: polycentric_ffi.INetworkRequestResponses | null;

    /** Result error */
    error?: string | null;

    /** Result value */
    value?: Uint8Array | null;
  }

  /** Represents a Result. */
  class Result implements IResult {
    /**
     * Constructs a new Result.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.IResult);

    /** Result requests. */
    public requests?: polycentric_ffi.INetworkRequestResponses | null;

    /** Result error. */
    public error?: string | null;

    /** Result value. */
    public value?: Uint8Array | null;

    /** Result result. */
    public result?: 'requests' | 'error' | 'value';

    /**
     * Creates a new Result instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Result instance
     */
    public static create(
      properties?: polycentric_ffi.IResult
    ): polycentric_ffi.Result;

    /**
     * Encodes the specified Result message. Does not implicitly {@link polycentric_ffi.Result.verify|verify} messages.
     * @param message Result message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.IResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Result message, length delimited. Does not implicitly {@link polycentric_ffi.Result.verify|verify} messages.
     * @param message Result message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.IResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a Result message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Result
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.Result;

    /**
     * Decodes a Result message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Result
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.Result;

    /**
     * Verifies a Result message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a Result message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Result
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.Result;

    /**
     * Creates a plain object from a Result message. Also converts values to other types if specified.
     * @param message Result
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.Result,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Result to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Result
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of an Option. */
  interface IOption {
    /** Option value */
    value?: Uint8Array | null;
  }

  /** Represents an Option. */
  class Option implements IOption {
    /**
     * Constructs a new Option.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.IOption);

    /** Option value. */
    public value?: Uint8Array | null;

    /**
     * Creates a new Option instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Option instance
     */
    public static create(
      properties?: polycentric_ffi.IOption
    ): polycentric_ffi.Option;

    /**
     * Encodes the specified Option message. Does not implicitly {@link polycentric_ffi.Option.verify|verify} messages.
     * @param message Option message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.IOption,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Option message, length delimited. Does not implicitly {@link polycentric_ffi.Option.verify|verify} messages.
     * @param message Option message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.IOption,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an Option message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Option
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.Option;

    /**
     * Decodes an Option message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Option
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.Option;

    /**
     * Verifies an Option message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an Option message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Option
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.Option;

    /**
     * Creates a plain object from an Option message. Also converts values to other types if specified.
     * @param message Option
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.Option,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Option to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Option
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a SyncResult. */
  interface ISyncResult {
    /** SyncResult eventsBytes */
    eventsBytes?: Uint8Array | null;

    /** SyncResult errors */
    errors?: polycentric_ffi.IServerError[] | null;
  }

  /** Represents a SyncResult. */
  class SyncResult implements ISyncResult {
    /**
     * Constructs a new SyncResult.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.ISyncResult);

    /** SyncResult eventsBytes. */
    public eventsBytes: Uint8Array;

    /** SyncResult errors. */
    public errors: polycentric_ffi.IServerError[];

    /**
     * Creates a new SyncResult instance using the specified properties.
     * @param [properties] Properties to set
     * @returns SyncResult instance
     */
    public static create(
      properties?: polycentric_ffi.ISyncResult
    ): polycentric_ffi.SyncResult;

    /**
     * Encodes the specified SyncResult message. Does not implicitly {@link polycentric_ffi.SyncResult.verify|verify} messages.
     * @param message SyncResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.ISyncResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified SyncResult message, length delimited. Does not implicitly {@link polycentric_ffi.SyncResult.verify|verify} messages.
     * @param message SyncResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.ISyncResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a SyncResult message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns SyncResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.SyncResult;

    /**
     * Decodes a SyncResult message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns SyncResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.SyncResult;

    /**
     * Verifies a SyncResult message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a SyncResult message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns SyncResult
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.SyncResult;

    /**
     * Creates a plain object from a SyncResult message. Also converts values to other types if specified.
     * @param message SyncResult
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.SyncResult,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this SyncResult to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for SyncResult
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a ServerError. */
  interface IServerError {
    /** ServerError server */
    server?: string | null;

    /** ServerError error */
    error?: string | null;
  }

  /** Represents a ServerError. */
  class ServerError implements IServerError {
    /**
     * Constructs a new ServerError.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.IServerError);

    /** ServerError server. */
    public server: string;

    /** ServerError error. */
    public error: string;

    /**
     * Creates a new ServerError instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ServerError instance
     */
    public static create(
      properties?: polycentric_ffi.IServerError
    ): polycentric_ffi.ServerError;

    /**
     * Encodes the specified ServerError message. Does not implicitly {@link polycentric_ffi.ServerError.verify|verify} messages.
     * @param message ServerError message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.IServerError,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ServerError message, length delimited. Does not implicitly {@link polycentric_ffi.ServerError.verify|verify} messages.
     * @param message ServerError message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.IServerError,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a ServerError message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ServerError
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.ServerError;

    /**
     * Decodes a ServerError message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ServerError
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.ServerError;

    /**
     * Verifies a ServerError message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a ServerError message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ServerError
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.ServerError;

    /**
     * Creates a plain object from a ServerError message. Also converts values to other types if specified.
     * @param message ServerError
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.ServerError,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ServerError to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ServerError
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a ResultAndServerErrors. */
  interface IResultAndServerErrors {
    /** ResultAndServerErrors result */
    result?: Uint8Array | null;

    /** ResultAndServerErrors errors */
    errors?: polycentric_ffi.IServerError[] | null;
  }

  /** Represents a ResultAndServerErrors. */
  class ResultAndServerErrors implements IResultAndServerErrors {
    /**
     * Constructs a new ResultAndServerErrors.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.IResultAndServerErrors);

    /** ResultAndServerErrors result. */
    public result: Uint8Array;

    /** ResultAndServerErrors errors. */
    public errors: polycentric_ffi.IServerError[];

    /**
     * Creates a new ResultAndServerErrors instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ResultAndServerErrors instance
     */
    public static create(
      properties?: polycentric_ffi.IResultAndServerErrors
    ): polycentric_ffi.ResultAndServerErrors;

    /**
     * Encodes the specified ResultAndServerErrors message. Does not implicitly {@link polycentric_ffi.ResultAndServerErrors.verify|verify} messages.
     * @param message ResultAndServerErrors message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.IResultAndServerErrors,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ResultAndServerErrors message, length delimited. Does not implicitly {@link polycentric_ffi.ResultAndServerErrors.verify|verify} messages.
     * @param message ResultAndServerErrors message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.IResultAndServerErrors,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a ResultAndServerErrors message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ResultAndServerErrors
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.ResultAndServerErrors;

    /**
     * Decodes a ResultAndServerErrors message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ResultAndServerErrors
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.ResultAndServerErrors;

    /**
     * Verifies a ResultAndServerErrors message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a ResultAndServerErrors message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ResultAndServerErrors
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.ResultAndServerErrors;

    /**
     * Creates a plain object from a ResultAndServerErrors message. Also converts values to other types if specified.
     * @param message ResultAndServerErrors
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.ResultAndServerErrors,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ResultAndServerErrors to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ResultAndServerErrors
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a Cursor. */
  interface ICursor {
    /** Cursor cursor */
    cursor?: Uint8Array | null;
  }

  /** Represents a Cursor. */
  class Cursor implements ICursor {
    /**
     * Constructs a new Cursor.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.ICursor);

    /** Cursor cursor. */
    public cursor?: Uint8Array | null;

    /**
     * Creates a new Cursor instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Cursor instance
     */
    public static create(
      properties?: polycentric_ffi.ICursor
    ): polycentric_ffi.Cursor;

    /**
     * Encodes the specified Cursor message. Does not implicitly {@link polycentric_ffi.Cursor.verify|verify} messages.
     * @param message Cursor message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.ICursor,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified Cursor message, length delimited. Does not implicitly {@link polycentric_ffi.Cursor.verify|verify} messages.
     * @param message Cursor message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.ICursor,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a Cursor message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Cursor
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.Cursor;

    /**
     * Decodes a Cursor message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Cursor
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.Cursor;

    /**
     * Verifies a Cursor message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a Cursor message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Cursor
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.Cursor;

    /**
     * Creates a plain object from a Cursor message. Also converts values to other types if specified.
     * @param message Cursor
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.Cursor,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this Cursor to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for Cursor
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a ServerCursors. */
  interface IServerCursors {
    /** ServerCursors cursors */
    cursors?: { [k: string]: polycentric_ffi.IOption } | null;
  }

  /** Represents a ServerCursors. */
  class ServerCursors implements IServerCursors {
    /**
     * Constructs a new ServerCursors.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.IServerCursors);

    /** ServerCursors cursors. */
    public cursors: { [k: string]: polycentric_ffi.IOption };

    /**
     * Creates a new ServerCursors instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ServerCursors instance
     */
    public static create(
      properties?: polycentric_ffi.IServerCursors
    ): polycentric_ffi.ServerCursors;

    /**
     * Encodes the specified ServerCursors message. Does not implicitly {@link polycentric_ffi.ServerCursors.verify|verify} messages.
     * @param message ServerCursors message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.IServerCursors,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ServerCursors message, length delimited. Does not implicitly {@link polycentric_ffi.ServerCursors.verify|verify} messages.
     * @param message ServerCursors message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.IServerCursors,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a ServerCursors message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ServerCursors
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.ServerCursors;

    /**
     * Decodes a ServerCursors message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ServerCursors
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.ServerCursors;

    /**
     * Verifies a ServerCursors message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a ServerCursors message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ServerCursors
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.ServerCursors;

    /**
     * Creates a plain object from a ServerCursors message. Also converts values to other types if specified.
     * @param message ServerCursors
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.ServerCursors,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ServerCursors to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ServerCursors
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a ServerFeedQuery. */
  interface IServerFeedQuery {
    /** ServerFeedQuery perServerLimit */
    perServerLimit?: number | Long | null;

    /** ServerFeedQuery moderationFilters */
    moderationFilters?: string | null;
  }

  /** Represents a ServerFeedQuery. */
  class ServerFeedQuery implements IServerFeedQuery {
    /**
     * Constructs a new ServerFeedQuery.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.IServerFeedQuery);

    /** ServerFeedQuery perServerLimit. */
    public perServerLimit?: number | Long | null;

    /** ServerFeedQuery moderationFilters. */
    public moderationFilters?: string | null;

    /**
     * Creates a new ServerFeedQuery instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ServerFeedQuery instance
     */
    public static create(
      properties?: polycentric_ffi.IServerFeedQuery
    ): polycentric_ffi.ServerFeedQuery;

    /**
     * Encodes the specified ServerFeedQuery message. Does not implicitly {@link polycentric_ffi.ServerFeedQuery.verify|verify} messages.
     * @param message ServerFeedQuery message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.IServerFeedQuery,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified ServerFeedQuery message, length delimited. Does not implicitly {@link polycentric_ffi.ServerFeedQuery.verify|verify} messages.
     * @param message ServerFeedQuery message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.IServerFeedQuery,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a ServerFeedQuery message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ServerFeedQuery
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.ServerFeedQuery;

    /**
     * Decodes a ServerFeedQuery message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ServerFeedQuery
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.ServerFeedQuery;

    /**
     * Verifies a ServerFeedQuery message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a ServerFeedQuery message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ServerFeedQuery
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.ServerFeedQuery;

    /**
     * Creates a plain object from a ServerFeedQuery message. Also converts values to other types if specified.
     * @param message ServerFeedQuery
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.ServerFeedQuery,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this ServerFeedQuery to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ServerFeedQuery
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of an InternalFeedResult. */
  interface IInternalFeedResult {
    /** InternalFeedResult result */
    result?: polycentric_ffi.IResultAndServerErrors | null;

    /** InternalFeedResult cursor */
    cursor?: polycentric_ffi.ICursor | null;
  }

  /** Represents an InternalFeedResult. */
  class InternalFeedResult implements IInternalFeedResult {
    /**
     * Constructs a new InternalFeedResult.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.IInternalFeedResult);

    /** InternalFeedResult result. */
    public result?: polycentric_ffi.IResultAndServerErrors | null;

    /** InternalFeedResult cursor. */
    public cursor?: polycentric_ffi.ICursor | null;

    /**
     * Creates a new InternalFeedResult instance using the specified properties.
     * @param [properties] Properties to set
     * @returns InternalFeedResult instance
     */
    public static create(
      properties?: polycentric_ffi.IInternalFeedResult
    ): polycentric_ffi.InternalFeedResult;

    /**
     * Encodes the specified InternalFeedResult message. Does not implicitly {@link polycentric_ffi.InternalFeedResult.verify|verify} messages.
     * @param message InternalFeedResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.IInternalFeedResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified InternalFeedResult message, length delimited. Does not implicitly {@link polycentric_ffi.InternalFeedResult.verify|verify} messages.
     * @param message InternalFeedResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.IInternalFeedResult,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes an InternalFeedResult message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns InternalFeedResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.InternalFeedResult;

    /**
     * Decodes an InternalFeedResult message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns InternalFeedResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.InternalFeedResult;

    /**
     * Verifies an InternalFeedResult message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates an InternalFeedResult message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns InternalFeedResult
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.InternalFeedResult;

    /**
     * Creates a plain object from an InternalFeedResult message. Also converts values to other types if specified.
     * @param message InternalFeedResult
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.InternalFeedResult,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this InternalFeedResult to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for InternalFeedResult
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a SearchQuery. */
  interface ISearchQuery {
    /** SearchQuery query */
    query?: string | null;

    /** SearchQuery type */
    type?: polycentric_ffi.SearchType | null;
  }

  /** Represents a SearchQuery. */
  class SearchQuery implements ISearchQuery {
    /**
     * Constructs a new SearchQuery.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.ISearchQuery);

    /** SearchQuery query. */
    public query: string;

    /** SearchQuery type. */
    public type: polycentric_ffi.SearchType;

    /**
     * Creates a new SearchQuery instance using the specified properties.
     * @param [properties] Properties to set
     * @returns SearchQuery instance
     */
    public static create(
      properties?: polycentric_ffi.ISearchQuery
    ): polycentric_ffi.SearchQuery;

    /**
     * Encodes the specified SearchQuery message. Does not implicitly {@link polycentric_ffi.SearchQuery.verify|verify} messages.
     * @param message SearchQuery message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.ISearchQuery,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified SearchQuery message, length delimited. Does not implicitly {@link polycentric_ffi.SearchQuery.verify|verify} messages.
     * @param message SearchQuery message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.ISearchQuery,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a SearchQuery message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns SearchQuery
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.SearchQuery;

    /**
     * Decodes a SearchQuery message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns SearchQuery
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.SearchQuery;

    /**
     * Verifies a SearchQuery message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a SearchQuery message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns SearchQuery
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.SearchQuery;

    /**
     * Creates a plain object from a SearchQuery message. Also converts values to other types if specified.
     * @param message SearchQuery
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.SearchQuery,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this SearchQuery to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for SearchQuery
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** SearchType enum. */
  enum SearchType {
    messages = 0,
    profiles = 1,
  }

  /** Properties of a CommentsFeedState. */
  interface ICommentsFeedState {
    /** CommentsFeedState event */
    event?: Uint8Array | null;

    /** CommentsFeedState cursors */
    cursors?: polycentric_ffi.IServerCursors | null;
  }

  /** Represents a CommentsFeedState. */
  class CommentsFeedState implements ICommentsFeedState {
    /**
     * Constructs a new CommentsFeedState.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.ICommentsFeedState);

    /** CommentsFeedState event. */
    public event: Uint8Array;

    /** CommentsFeedState cursors. */
    public cursors?: polycentric_ffi.IServerCursors | null;

    /**
     * Creates a new CommentsFeedState instance using the specified properties.
     * @param [properties] Properties to set
     * @returns CommentsFeedState instance
     */
    public static create(
      properties?: polycentric_ffi.ICommentsFeedState
    ): polycentric_ffi.CommentsFeedState;

    /**
     * Encodes the specified CommentsFeedState message. Does not implicitly {@link polycentric_ffi.CommentsFeedState.verify|verify} messages.
     * @param message CommentsFeedState message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.ICommentsFeedState,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified CommentsFeedState message, length delimited. Does not implicitly {@link polycentric_ffi.CommentsFeedState.verify|verify} messages.
     * @param message CommentsFeedState message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.ICommentsFeedState,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a CommentsFeedState message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns CommentsFeedState
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.CommentsFeedState;

    /**
     * Decodes a CommentsFeedState message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns CommentsFeedState
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.CommentsFeedState;

    /**
     * Verifies a CommentsFeedState message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a CommentsFeedState message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns CommentsFeedState
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.CommentsFeedState;

    /**
     * Creates a plain object from a CommentsFeedState message. Also converts values to other types if specified.
     * @param message CommentsFeedState
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.CommentsFeedState,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this CommentsFeedState to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for CommentsFeedState
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a FeedQuery. */
  interface IFeedQuery {
    /** FeedQuery systemBytes */
    systemBytes?: Uint8Array | null;

    /** FeedQuery startTime */
    startTime?: number | Long | null;

    /** FeedQuery endTime */
    endTime?: number | Long | null;

    /** FeedQuery limit */
    limit?: number | Long | null;

    /** FeedQuery cursor */
    cursor?: Uint8Array | null;
  }

  /** Represents a FeedQuery. */
  class FeedQuery implements IFeedQuery {
    /**
     * Constructs a new FeedQuery.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.IFeedQuery);

    /** FeedQuery systemBytes. */
    public systemBytes: Uint8Array;

    /** FeedQuery startTime. */
    public startTime?: number | Long | null;

    /** FeedQuery endTime. */
    public endTime?: number | Long | null;

    /** FeedQuery limit. */
    public limit?: number | Long | null;

    /** FeedQuery cursor. */
    public cursor?: Uint8Array | null;

    /**
     * Creates a new FeedQuery instance using the specified properties.
     * @param [properties] Properties to set
     * @returns FeedQuery instance
     */
    public static create(
      properties?: polycentric_ffi.IFeedQuery
    ): polycentric_ffi.FeedQuery;

    /**
     * Encodes the specified FeedQuery message. Does not implicitly {@link polycentric_ffi.FeedQuery.verify|verify} messages.
     * @param message FeedQuery message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.IFeedQuery,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified FeedQuery message, length delimited. Does not implicitly {@link polycentric_ffi.FeedQuery.verify|verify} messages.
     * @param message FeedQuery message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.IFeedQuery,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a FeedQuery message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns FeedQuery
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.FeedQuery;

    /**
     * Decodes a FeedQuery message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns FeedQuery
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.FeedQuery;

    /**
     * Verifies a FeedQuery message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a FeedQuery message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns FeedQuery
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.FeedQuery;

    /**
     * Creates a plain object from a FeedQuery message. Also converts values to other types if specified.
     * @param message FeedQuery
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.FeedQuery,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this FeedQuery to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for FeedQuery
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }

  /** Properties of a LogicalClock. */
  interface ILogicalClock {
    /** LogicalClock clock */
    clock?: number | Long | null;
  }

  /** Represents a LogicalClock. */
  class LogicalClock implements ILogicalClock {
    /**
     * Constructs a new LogicalClock.
     * @param [properties] Properties to set
     */
    constructor(properties?: polycentric_ffi.ILogicalClock);

    /** LogicalClock clock. */
    public clock: number | Long;

    /**
     * Creates a new LogicalClock instance using the specified properties.
     * @param [properties] Properties to set
     * @returns LogicalClock instance
     */
    public static create(
      properties?: polycentric_ffi.ILogicalClock
    ): polycentric_ffi.LogicalClock;

    /**
     * Encodes the specified LogicalClock message. Does not implicitly {@link polycentric_ffi.LogicalClock.verify|verify} messages.
     * @param message LogicalClock message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(
      message: polycentric_ffi.ILogicalClock,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Encodes the specified LogicalClock message, length delimited. Does not implicitly {@link polycentric_ffi.LogicalClock.verify|verify} messages.
     * @param message LogicalClock message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(
      message: polycentric_ffi.ILogicalClock,
      writer?: $protobuf.Writer
    ): $protobuf.Writer;

    /**
     * Decodes a LogicalClock message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns LogicalClock
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(
      reader: $protobuf.Reader | Uint8Array,
      length?: number
    ): polycentric_ffi.LogicalClock;

    /**
     * Decodes a LogicalClock message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns LogicalClock
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(
      reader: $protobuf.Reader | Uint8Array
    ): polycentric_ffi.LogicalClock;

    /**
     * Verifies a LogicalClock message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): string | null;

    /**
     * Creates a LogicalClock message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns LogicalClock
     */
    public static fromObject(object: {
      [k: string]: any;
    }): polycentric_ffi.LogicalClock;

    /**
     * Creates a plain object from a LogicalClock message. Also converts values to other types if specified.
     * @param message LogicalClock
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(
      message: polycentric_ffi.LogicalClock,
      options?: $protobuf.IConversionOptions
    ): { [k: string]: any };

    /**
     * Converts this LogicalClock to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for LogicalClock
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
  }
}
