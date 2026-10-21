import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const ACTIONS = Object.freeze(['notice.draft', 'notice.send_authority', 'notice.send_individuals']);

export class ApprovalCodec {
  constructor(secret, { clock = Date.now, audience = 'prism-local-desk' } = {}) {
    if (!(secret instanceof Uint8Array) || secret.byteLength < 32) throw new TypeError('A 32-byte signing key is required');
    this.secret = Buffer.from(secret);
    this.clock = clock;
    this.audience = audience;
  }
  signature(payload) { return createHmac('sha256', this.secret).update(payload).digest(); }
  issue({ incidentId, action, ttlSeconds = 300 }) {
    if (!incidentId || !ACTIONS.includes(action) || !Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 900) throw new TypeError('Invalid approval policy');
    const now = Math.floor(this.clock() / 1000);
    const claims = { version: 1, id: randomUUID(), aud: this.audience, incidentId, action, iat: now, exp: now + ttlSeconds };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return { token: `${payload}.${this.signature(payload).toString('base64url')}`, claims };
  }
  verify(token) {
    if (typeof token !== 'string' || token.length > 4096) throw new Error('Invalid approval');
    const parts = token.split('.');
    if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error('Invalid approval');
    const signature = Buffer.from(parts[1], 'base64url');
    const expected = this.signature(parts[0]);
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new Error('Invalid approval signature');
    const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const now = Math.floor(this.clock() / 1000);
    if (claims.version !== 1 || claims.aud !== this.audience || !ACTIONS.includes(claims.action) || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || claims.iat > now || claims.exp <= now || claims.exp - claims.iat > 900) throw new Error('Approval expired or wrong audience');
    return claims;
  }
}
