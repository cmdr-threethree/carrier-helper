import { describe, expect, it } from 'vitest';
import {
  base64UrlEncode,
  createCodeChallenge,
  createCodeVerifier,
  createState,
} from '../src/auth/pkce';

describe('PKCE helpers', () => {
  it('encodes base64url without padding by default', () => {
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
  });

  it('can retain padding for the Frontier verifier quirk', () => {
    const verifier = createCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+={0,2}$/);
    expect(verifier.endsWith('=')).toBe(true);
  });

  it('produces an unpadded state', () => {
    const state = createState();
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(state).not.toContain('=');
  });

  it('matches the RFC 7636 challenge vector', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(await createCodeChallenge(verifier)).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});
