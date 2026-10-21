import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');

export class IncidentLedger {
  constructor({ clock = Date.now } = {}) { this.clock = clock; this.entries = []; this.ids = new Set(); }
  append({ eventId, incidentId, actor, action, note = '' }) {
    if (!eventId || !incidentId || !actor || !action || this.ids.has(eventId)) throw new Error('Invalid or duplicate ledger event');
    if (typeof note !== 'string' || note.length > 500) throw new TypeError('Note is invalid');
    const previousHash = this.entries.at(-1)?.hash ?? '0'.repeat(64);
    const record = { sequence: this.entries.length, timestamp: new Date(this.clock()).toISOString(), eventId, incidentId, actor, action, note, previousHash };
    const entry = { ...record, hash: hash(JSON.stringify(record)) };
    this.entries.push(entry);
    this.ids.add(eventId);
    return structuredClone(entry);
  }
  snapshot() { return structuredClone(this.entries); }
  static verify(entries, expectedHead) {
    let previous = '0'.repeat(64);
    const events = new Set();
    for (const entry of entries) {
      const { hash: recorded, ...record } = entry;
      if (record.sequence !== events.size || record.previousHash !== previous || events.has(record.eventId) || hash(JSON.stringify(record)) !== recorded) return false;
      events.add(record.eventId);
      previous = recorded;
    }
    return expectedHead === undefined || previous === expectedHead;
  }
}
