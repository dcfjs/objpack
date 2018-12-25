import BufferList = require('bl');

export type Encodeable =
  | undefined
  | null
  | boolean
  | number
  | string
  | Buffer
  | Uint8Array
  | Array<any>
  | Date
  | { [key: string]: any };

export type EncodingType = {
  check: (v: any) => boolean;
  encode: (v: any) => Buffer | BufferList;
};

function isFloat(n: number) {
  return n % 1 !== 0;
}

const encodingTypes: EncodingType[] = [];

function encodeDate(dt: Date) {
  var encoded;
  var millis = dt.getTime();
  var seconds = Math.floor(millis / 1000);
  var nanos = (millis - seconds * 1000) * 1e6;

  if (nanos || seconds > 0xffffffff) {
    // Timestamp64
    encoded = Buffer.allocUnsafe(10);
    encoded[0] = 0xd7;
    encoded[1] = -1;

    var upperNanos = nanos * 4;
    var upperSeconds = seconds / Math.pow(2, 32);
    var upper = (upperNanos + upperSeconds) & 0xffffffff;
    var lower = seconds & 0xffffffff;

    encoded.writeInt32BE(upper, 2);
    encoded.writeInt32BE(lower, 6);
  } else {
    // Timestamp32
    encoded = Buffer.allocUnsafe(6);
    encoded[0] = 0xd6;
    encoded[1] = -1;
    encoded.writeUInt32BE(Math.floor(millis / 1000), 2);
  }
  return encoded;
}

function encodeExt(obj: any) {
  let encoded;
  let length = -1;
  let headers = [];

  for (let i = 0; i < encodingTypes.length; i++) {
    if (encodingTypes[i].check(obj)) {
      encoded = encodingTypes[i].encode(obj);
      break;
    }
  }

  if (!encoded) {
    return null;
  }

  // we subtract 1 because the length does not
  // include the type
  length = encoded.length - 1;

  if (length === 1) {
    headers.push(0xd4);
  } else if (length === 2) {
    headers.push(0xd5);
  } else if (length === 4) {
    headers.push(0xd6);
  } else if (length === 8) {
    headers.push(0xd7);
  } else if (length === 16) {
    headers.push(0xd8);
  } else if (length < 256) {
    headers.push(0xc7);
    headers.push(length);
  } else if (length < 0x10000) {
    headers.push(0xc8);
    headers.push(length >> 8);
    headers.push(length & 0x00ff);
  } else {
    headers.push(0xc9);
    headers.push(length >> 24);
    headers.push((length >> 16) & 0x000000ff);
    headers.push((length >> 8) & 0x000000ff);
    headers.push(length & 0x000000ff);
  }

  const ret = new BufferList();
  ret.append(Buffer.from(headers));
  ret.append(encoded);
  return ret;
}

function encodeObject(obj: { [key: string]: string }) {
  const acc = [];
  let length = 0;
  let header;

  for (const key of Object.keys(obj)) {
    if (obj.hasOwnProperty(key) && typeof obj[key] !== 'function') {
      ++length;
      acc.push(encodeInternal(key));
      acc.push(encodeInternal(obj[key]));
    }
  }

  if (length < 16) {
    header = Buffer.allocUnsafe(1);
    header[0] = 0x80 | length;
  } else if (length < 0xffff) {
    header = Buffer.allocUnsafe(3);
    header[0] = 0xde;
    header.writeUInt16BE(length, 1);
  } else {
    header = Buffer.allocUnsafe(5);
    header[0] = 0xdf;
    header.writeUInt32BE(length, 1);
  }

  acc.unshift(header);

  var result = new BufferList();

  for (const item of acc) {
    result.append(item);
  }

  return result;
}

function encodeFloat(obj: number) {
  var useDoublePrecision = true;

  // If `fround` is supported, we can check if a float
  // is double or single precision by rounding the object
  // to single precision and comparing the difference.
  // If it's not supported, it's safer to use a 64 bit
  // float so we don't lose precision without meaning to.
  if (Math.fround) {
    useDoublePrecision = obj === obj && Math.fround(obj) !== obj;
  }

  var buf;

  if (useDoublePrecision) {
    buf = Buffer.allocUnsafe(9);
    buf[0] = 0xcb;
    buf.writeDoubleBE(obj, 1);
  } else {
    buf = Buffer.allocUnsafe(5);
    buf[0] = 0xca;
    buf.writeFloatBE(obj, 1);
  }

  return buf;
}

function write64BitUint(buf: Buffer, obj: number) {
  // Write long byte by byte, in big-endian order
  for (var currByte = 7; currByte >= 0; currByte--) {
    buf[currByte + 1] = obj & 0xff;
    obj = obj / 256;
  }
}

function write64BitInt(buf: Buffer, offset: number, num: number) {
  var negate = num < 0;

  if (negate) {
    num = Math.abs(num);
  }

  var lo = num % 4294967296;
  var hi = num / 4294967296;
  buf.writeUInt32BE(Math.floor(hi), offset + 0);
  buf.writeUInt32BE(lo, offset + 4);

  if (negate) {
    var carry = 1;
    for (var i = offset + 7; i >= offset; i--) {
      var v = (buf[i] ^ 0xff) + carry;
      buf[i] = v & 0xff;
      carry = v >> 8;
    }
  }
}

function encodeInternal(obj: Encodeable): Buffer | BufferList {
  let buf;

  if (obj === undefined) {
    buf = Buffer.allocUnsafe(1);
    buf[0] = 0xc1;
  } else if (obj === null) {
    buf = Buffer.allocUnsafe(1);
    buf[0] = 0xc0;
  } else if (obj === true) {
    buf = Buffer.allocUnsafe(1);
    buf[0] = 0xc3;
  } else if (obj === false) {
    buf = Buffer.allocUnsafe(1);
    buf[0] = 0xc2;
  } else if (typeof obj === 'string') {
    const len = Buffer.byteLength(obj);
    if (len < 32) {
      buf = Buffer.allocUnsafe(1 + len);
      buf[0] = 0xa0 | len;
      if (len > 0) {
        buf.write(obj, 1);
      }
    } else if (len <= 0xff) {
      buf = Buffer.allocUnsafe(2 + len);
      buf[0] = 0xd9;
      buf[1] = len;
      buf.write(obj, 2);
    } else if (len <= 0xffff) {
      buf = Buffer.allocUnsafe(3 + len);
      buf[0] = 0xda;
      buf.writeUInt16BE(len, 1);
      buf.write(obj, 3);
    } else {
      buf = Buffer.allocUnsafe(5 + len);
      buf[0] = 0xdb;
      buf.writeUInt32BE(len, 1);
      buf.write(obj, 5);
    }
  } else if (obj && ((obj as any).readUInt32LE || obj instanceof Uint8Array)) {
    if (obj instanceof Uint8Array) {
      obj = Buffer.from(obj);
    }
    // weird hack to support Buffer
    // and Buffer-like objects
    const length = (obj as Buffer).length;
    if (length <= 0xff) {
      buf = Buffer.allocUnsafe(2);
      buf[0] = 0xc4;
      buf[1] = length;
    } else if (length <= 0xffff) {
      buf = Buffer.allocUnsafe(3);
      buf[0] = 0xc5;
      buf.writeUInt16BE(length, 1);
    } else {
      buf = Buffer.allocUnsafe(5);
      buf[0] = 0xc6;
      buf.writeUInt32BE(length, 1);
    }

    buf = new BufferList([buf, obj as Buffer]);
  } else if (Array.isArray(obj)) {
    if (obj.length < 16) {
      buf = Buffer.allocUnsafe(1);
      buf[0] = 0x90 | obj.length;
    } else if (obj.length < 65536) {
      buf = Buffer.allocUnsafe(3);
      buf[0] = 0xdc;
      buf.writeUInt16BE(obj.length, 1);
    } else {
      buf = Buffer.allocUnsafe(5);
      buf[0] = 0xdd;
      buf.writeUInt32BE(obj.length, 1);
    }

    buf = obj.reduce(function(acc, obj) {
      acc.append(encodeInternal(obj));
      return acc;
    }, new BufferList().append(buf));
  } else if (obj instanceof Date) {
    return encodeDate(obj);
  } else if (typeof obj === 'object') {
    buf = encodeExt(obj) || encodeObject(obj);
  } else if (typeof obj === 'number') {
    if (isFloat(obj)) {
      return encodeFloat(obj);
    } else if (obj >= 0) {
      if (obj < 128) {
        buf = Buffer.allocUnsafe(1);
        buf[0] = obj;
      } else if (obj < 256) {
        buf = Buffer.allocUnsafe(2);
        buf[0] = 0xcc;
        buf[1] = obj;
      } else if (obj < 65536) {
        buf = Buffer.allocUnsafe(3);
        buf[0] = 0xcd;
        buf.writeUInt16BE(obj, 1);
      } else if (obj <= 0xffffffff) {
        buf = Buffer.allocUnsafe(5);
        buf[0] = 0xce;
        buf.writeUInt32BE(obj, 1);
      } else if (obj <= 9007199254740991) {
        buf = Buffer.allocUnsafe(9);
        buf[0] = 0xcf;
        write64BitUint(buf, obj);
      } else {
        return encodeFloat(obj);
      }
    } else {
      if (obj >= -32) {
        buf = Buffer.allocUnsafe(1);
        buf[0] = 0x100 + obj;
      } else if (obj >= -128) {
        buf = Buffer.allocUnsafe(2);
        buf[0] = 0xd0;
        buf.writeInt8(obj, 1);
      } else if (obj >= -32768) {
        buf = Buffer.allocUnsafe(3);
        buf[0] = 0xd1;
        buf.writeInt16BE(obj, 1);
      } else if (obj > -214748365) {
        buf = Buffer.allocUnsafe(5);
        buf[0] = 0xd2;
        buf.writeInt32BE(obj, 1);
      } else if (obj >= -9007199254740991) {
        buf = Buffer.allocUnsafe(9);
        buf[0] = 0xd3;
        write64BitInt(buf, 1, obj);
      } else {
        return encodeFloat(obj);
      }
    }
  } else {
    throw new Error('not implemented yet');
  }

  return buf;
}

// Slice only once to generate a raw buffer object.
export const encode = (obj: Encodeable) => encodeInternal(obj).slice();
