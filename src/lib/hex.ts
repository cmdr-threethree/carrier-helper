/**
 * Frontier returns carrier vanity names as hex-encoded bytes.
 * Returns null when the value is missing or cannot be decoded.
 */
export function decodeCapiName(hex: unknown): string | null {
  if (typeof hex !== 'string') return null;
  let value = hex.trim();
  if (!value) return null;
  if (value.startsWith('0x') || value.startsWith('0X')) value = value.slice(2);
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) return null;

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
  }
}

export function encodeCapiName(value: string): string {
  return Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function carrierDisplayName(name: {
  callsign?: string;
  vanityName?: string;
  filteredVanityName?: string;
} | null | undefined): string {
  if (!name) return 'Unknown carrier';
  return (
    decodeCapiName(name.filteredVanityName) ||
    decodeCapiName(name.vanityName) ||
    name.callsign ||
    'Unknown carrier'
  );
}
