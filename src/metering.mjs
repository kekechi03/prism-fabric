import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');

export class UsageJournal {
  constructor({ clock = Date.now } = {}) { this.clock = clock; this.entries = []; this.ids = new Set(); }
  append({ requestId, leaseId, pool, gpuSeconds, outputTokens }) {
    if (!requestId || !leaseId || !pool || this.ids.has(requestId)) throw new Error('Invalid or duplicate usage receipt');
    if (!Number.isFinite(gpuSeconds) || gpuSeconds < 0 || !Number.isSafeInteger(outputTokens) || outputTokens < 0) throw new TypeError('Invalid usage counters');
    const previousHash = this.entries.at(-1)?.hash ?? '0'.repeat(64);
    const record = { sequence: this.entries.length, timestamp: new Date(this.clock()).toISOString(), requestId, leaseId, pool, gpuSeconds, outputTokens, previousHash };
    const entry = { ...record, hash: hash(JSON.stringify(record)) };
    this.entries.push(entry);
    this.ids.add(requestId);
    return structuredClone(entry);
  }
  snapshot() { return structuredClone(this.entries); }
  static verify(entries, expectedHead) {
    let previous = '0'.repeat(64);
    const requests = new Set();
    for (const entry of entries) {
      const { hash: recorded, ...record } = entry;
      if (record.sequence !== requests.size || record.previousHash !== previous || requests.has(record.requestId) || hash(JSON.stringify(record)) !== recorded) return false;
      requests.add(record.requestId);
      previous = recorded;
    }
    return expectedHead === undefined || previous === expectedHead;
  }
}
