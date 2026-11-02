import { describe, expect, it } from 'vitest';
import { carrierDisplayName, decodeCapiName, encodeCapiName } from '../src/lib/hex';

describe('CAPI name decoding', () => {
  it('decodes UTF-8 hex names', () => {
    expect(decodeCapiName('4c6f6e67204861756c')).toBe('Long Haul');
  });

  it('round-trips encoded names', () => {
    expect(decodeCapiName(encodeCapiName('★ Carrier'))).toBe('★ Carrier');
  });

  it('rejects malformed values', () => {
    expect(decodeCapiName('abc')).toBeNull();
    expect(decodeCapiName('zz')).toBeNull();
    expect(decodeCapiName('')).toBeNull();
    expect(decodeCapiName(null)).toBeNull();
  });

  it('prefers the filtered name and falls back to callsign', () => {
    const filtered = encodeCapiName('Filtered');
    const vanity = encodeCapiName('Original');
    expect(
      carrierDisplayName({
        callsign: 'ABC-123',
        vanityName: vanity,
        filteredVanityName: filtered,
      }),
    ).toBe('Filtered');
    expect(carrierDisplayName({ callsign: 'ABC-123' })).toBe('ABC-123');
  });
});
