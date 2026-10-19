import { readFile } from 'node:fs/promises';
import { planBatch } from '../src/scheduler.mjs';
const read = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url)));
const result = planBatch(await read('fleet'), await read('batch'));
console.table(result.assignments.map(row => ({ request: row.requestId, state: row.state, pool: row.placement?.pool ?? '-', readyMs: row.placement?.readyMs ?? '-', slots: row.slots ?? 0 })));
console.log(JSON.stringify({ admitted: result.admitted, queued: result.assignments.length - result.admitted }));
