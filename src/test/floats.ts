import assert = require('assert');
import { encode } from '../index';

describe('encoding float numbers', function() {
  const float32 = [1.5, 0.15625, -2.5];

  const float64 = [2 ** 150, 1.337, 2.2];

  float64.forEach(function(num) {
    describe('encoding ' + num, function() {
      const buf = encode(num);
      it('must have 9 bytes', () => assert.strictEqual(buf.length, 9));
      it('must have the proper header', () => assert.strictEqual(buf[0], 0xcb));

      const dec = buf.readDoubleBE(1);
      it('must decode correctly', () => assert.strictEqual(dec, num));
    });
  });

  float32.forEach(function(num) {
    describe('encoding ' + num, function() {
      const buf = encode(num);
      it('must have 5 bytes', () => assert.strictEqual(buf.length, 5));
      it('must have the proper header', () => assert.strictEqual(buf[0], 0xca));

      const dec = buf.readFloatBE(1);
      it('must decode correctly', () => assert.strictEqual(dec, num));
    });
  });

  describe('encoding NaN', function() {
    const buf = encode(NaN);
    it('must have 5 bytes', () => assert.strictEqual(buf.length, 5));
    it('must have the proper header', () => assert.strictEqual(buf[0], 0xca));

    const dec = buf.readFloatBE(1);
    it('must decode correctly', () => assert(dec !== dec));
  });
});
