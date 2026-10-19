import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { rankPools, planBatch } from '../src/scheduler.mjs';
import { LeaseCodec } from '../src/leases.mjs';
import { UsageJournal } from '../src/metering.mjs';
import { createPreviewServer } from '../src/server.mjs';

const fleet = JSON.parse(await readFile(new URL('../fixtures/fleet.json', import.meta.url)));
const batch = JSON.parse(await readFile(new URL('../fixtures/batch.json', import.meta.url)));

test('batch reservations respect remaining slots and regional overflow', () => {
  const result = planBatch(fleet, batch);
  assert.equal(result.admitted, 3);
  assert.deepEqual(result.assignments.map(row => row.placement.pool), ['apne1-throughput', 'apne1-elastic', 'usw2-reserve']);
  assert.equal(fleet[0].availableSlots, 6);
  assert.ok(result.remaining.every(pool => pool.availableSlots >= 0));
});
test('memory, region and deadline policies cannot be overridden by score', () => {
  const request = { ...batch[0], memoryGiB: 160 };
  assert.ok(rankPools(fleet, request).every(pool => !pool.eligible));
  assert.equal(planBatch(fleet, [request]).assignments[0].state, 'queued');
  assert.throws(() => rankPools(fleet, { ...request, slots: -1 }));
});
test('oversubscribed batches queue and duplicate request IDs are rejected', () => {
  const jobs = [0, 1, 2].map(id => ({ ...batch[0], id: String(id), slots: 6 }));
  assert.equal(planBatch(fleet, jobs).admitted, 1);
  assert.throws(() => planBatch(fleet, [batch[0], batch[0]]));
});
test('lease signatures reject tampering, expiry and another audience', () => {
  const key = randomBytes(32);
  let now = 1000000;
  const codec = new LeaseCodec(key, { clock: () => now });
  const lease = codec.issue({ pool: 'p', model: 'm', slots: 2, ttlSeconds: 60 });
  assert.equal(codec.verify(lease.token).slots, 2);
  const parts = lease.token.split('.');
  parts[0] = Buffer.from(JSON.stringify({ ...lease.claims, slots: 100 })).toString('base64url');
  assert.throws(() => codec.verify(parts.join('.')));
  assert.throws(() => new LeaseCodec(key, { clock: () => now, audience: 'another-runner' }).verify(lease.token));
  now += 60000;
  assert.throws(() => codec.verify(lease.token));
});
test('usage receipts detect edits, duplicates and truncation against a head hash', () => {
  const journal = new UsageJournal();
  const first = journal.append({ requestId: 'a', leaseId: 'l', pool: 'p', gpuSeconds: 1.5, outputTokens: 80 });
  const second = journal.append({ requestId: 'b', leaseId: 'l', pool: 'p', gpuSeconds: 2, outputTokens: 100 });
  assert.ok(UsageJournal.verify(journal.snapshot(), second.hash));
  const edited = journal.snapshot();
  edited[0].gpuSeconds = 0;
  assert.equal(UsageJournal.verify(edited), false);
  assert.equal(UsageJournal.verify([first], second.hash), false);
  assert.throws(() => journal.append({ requestId: 'a', leaseId: 'l', pool: 'p', gpuSeconds: 0, outputTokens: 1 }));
});
test('local HTTP preview plans capacity and rejects malformed batches', async () => {
  const server = await createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(origin + '/healthz')).status, 200);
    const response = await fetch(origin + '/v1/plans', { method: 'POST', body: JSON.stringify({ requests: batch }) });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.plan.admitted, 3);
    assert.equal(body.leasePreviews.length, 3);
    assert.equal((await fetch(origin + '/v1/plans', { method: 'POST', body: '{bad' })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('public examples and local runtime do not consume staging credentials', async () => {
  for (const file of ['../src/server.mjs', '../examples/plan-batch.mjs']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /staging\.env|apne1\.staging\.json|bootstrap-control\.json|process\.env|fetch\(/);
  }
});
