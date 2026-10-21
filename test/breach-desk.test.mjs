import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { assessIncident, assessBatch, exposureScore } from '../src/triage.mjs';
import { ApprovalCodec } from '../src/approvals.mjs';
import { IncidentLedger } from '../src/ledger.mjs';
import { createPreviewServer } from '../src/server.mjs';

const read = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url)));
const incidents = await read('incidents');
const jurisdictions = await read('jurisdictions');

test('sensitive categories and volume raise severity; encryption lowers it', () => {
  const open = incidents[1].dataset;
  assert.ok(exposureScore(open) > exposureScore({ ...open, encrypted: true }));
  assert.ok(exposureScore(open) > exposureScore({ ...open, records: 10 }));
  assert.equal(assessIncident(incidents[1], jurisdictions).severity, 'critical');
  assert.equal(assessIncident(incidents[3], jurisdictions).severity, 'low');
});
test('authority deadlines follow each jurisdiction rule', () => {
  const eu = assessIncident(incidents[1], jurisdictions).notifications.find(n => n.jurisdiction === 'EU');
  assert.equal(eu.state, 'authority_notice_required');
  assert.equal(eu.authorityDueAt, '2026-03-12T01:30:00.000Z');
  const unknown = assessIncident({ ...incidents[0], jurisdictions: ['ZZ'] }, jurisdictions).notifications[0];
  assert.equal(unknown.state, 'unconfigured');
});
test('invalid incidents and duplicate IDs are rejected', () => {
  assert.throws(() => assessIncident({ ...incidents[0], dataset: { ...incidents[0].dataset, records: -1 } }, jurisdictions));
  assert.throws(() => assessIncident({ ...incidents[0], dataset: { ...incidents[0].dataset, categories: ['mystery'] } }, jurisdictions));
  assert.throws(() => assessBatch([incidents[0], incidents[0]], jurisdictions));
  const batch = assessBatch(incidents, jurisdictions);
  assert.equal(batch.assessments[0].incidentId, 'INC-0002');
});
test('approval signatures reject tampering, expiry and another audience', () => {
  const key = randomBytes(32);
  let now = 1000000;
  const codec = new ApprovalCodec(key, { clock: () => now });
  const approval = codec.issue({ incidentId: 'INC-1', action: 'notice.draft', ttlSeconds: 60 });
  assert.equal(codec.verify(approval.token).incidentId, 'INC-1');
  const parts = approval.token.split('.');
  parts[0] = Buffer.from(JSON.stringify({ ...approval.claims, action: 'notice.send_individuals' })).toString('base64url');
  assert.throws(() => codec.verify(parts.join('.')));
  assert.throws(() => new ApprovalCodec(key, { clock: () => now, audience: 'another-desk' }).verify(approval.token));
  assert.throws(() => codec.issue({ incidentId: 'INC-1', action: 'notice.delete_everything' }));
  now += 60000;
  assert.throws(() => codec.verify(approval.token));
});
test('ledger detects edits, duplicates and truncation against a head hash', () => {
  const ledger = new IncidentLedger();
  const first = ledger.append({ eventId: 'a', incidentId: 'INC-1', actor: 'analyst', action: 'opened' });
  const second = ledger.append({ eventId: 'b', incidentId: 'INC-1', actor: 'analyst', action: 'drafted' });
  assert.ok(IncidentLedger.verify(ledger.snapshot(), second.hash));
  const edited = ledger.snapshot();
  edited[0].actor = 'someone-else';
  assert.equal(IncidentLedger.verify(edited), false);
  assert.equal(IncidentLedger.verify([first], second.hash), false);
  assert.throws(() => ledger.append({ eventId: 'a', incidentId: 'INC-1', actor: 'analyst', action: 'again' }));
});
test('local HTTP preview assesses incidents and rejects malformed batches', async () => {
  const server = await createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(origin + '/healthz')).status, 200);
    const response = await fetch(origin + '/v1/assessments', { method: 'POST', body: JSON.stringify({ incidents }) });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.result.assessments.length, 4);
    assert.equal(body.approvalPreviews.length, body.result.requiringAuthorityNotice);
    assert.equal((await fetch(origin + '/v1/assessments', { method: 'POST', body: '{bad' })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('public examples and local runtime do not consume staging credentials', async () => {
  for (const file of ['../src/server.mjs', '../examples/assess-incidents.mjs']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /staging\.env|jp\.staging\.json|bootstrap-control\.json|process\.env|fetch\(/);
  }
});
