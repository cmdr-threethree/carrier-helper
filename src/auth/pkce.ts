const encoder = new TextEncoder();

export function randomBytes(length = 32): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function base64UrlEncode(bytes: Uint8Array, keepPadding = false): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_');
  return keepPadding ? base64 : base64.replace(/=+$/g, '');
}

export function createCodeVerifier(): string {
  // Frontier requires the verifier's base64url padding to remain intact.
  return base64UrlEncode(randomBytes(32), true);
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  return base64UrlEncode(new Uint8Array(digest), false);
}

export function createState(): string {
  return base64UrlEncode(randomBytes(32), false);
}
