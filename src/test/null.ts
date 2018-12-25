import assert = require('assert');
import { encode } from '../index';

describe('encode null & undefined', function() {
  it('encode null as 0xc0', () => assert.strictEqual(encode(null)[0], 0xc0));
  it('encode null as a buffer of length 1', () =>
    assert.strictEqual(encode(null).length, 1));

  it('encode undefined as 0xc1', () =>
    assert.strictEqual(encode(undefined)[0], 0xc1));
  it('encode undefined as a buffer of length 1', () =>
    assert.strictEqual(encode(undefined).length, 1));
});
