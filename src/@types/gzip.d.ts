// https://github.com/imaya/zlib.js/issues/47#issuecomment-351906524

declare namespace Zlib {
  enum CompressionType {
    NONE = 0,
    FIXED = 1,
    DYNAMIC = 2,
  }

  namespace Gzip {
    interface Options {
      deflateOptions: {
        compressionType: Zlib.CompressionType
      }
      flags: {
        fname: boolean // use filename?
        comment: boolean // use comment?
        fhcrc: boolean // use file checksum?
      }
      filename: string // filename
      comment: string
    }
  }

  namespace Deflate {
    interface Options {
      compressionType: CompressionType
    }
  }

  namespace Inflate {
    enum BufferType {
      BLOCK = 0,
      ADAPTIVE = 1,
    }
    interface Options {
      index?: number // start position in input buffer
      bufferSize?: number // initial output buffer size
      bufferType?: Zlib.Inflate.BufferType // buffer expantion type
      resize?: boolean // resize buffer(ArrayBuffer) when end of decompression (default: false)
      verify?: boolean // verify decompression result (default: false)
    }
  }

  class Gzip {
    constructor(data: Array<number> | Uint8Array, options?: Gzip.Options)
    public compress(): Uint8Array
  }

  class Gunzip {
    constructor(data: Array<number> | Uint8Array)
    public decompress(): Uint8Array
  }

  class Deflate {
    constructor(data: Array<number> | Uint8Array, options?: Deflate.Options)
    public compress(): Uint8Array
  }

  class Inflate {
    constructor(data: Array<number> | Uint8Array, options?: Inflate.Options)
    public decompress(): Uint8Array
  }
}
