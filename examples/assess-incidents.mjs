import { readFile } from 'node:fs/promises';
import { assessBatch } from '../src/triage.mjs';
const read = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url)));
const result = assessBatch(await read('incidents'), await read('jurisdictions'));
console.table(result.assessments.map(row => ({ incident: row.incidentId, severity: row.severity, score: row.score,
  authorityNotices: row.notifications.filter(n => n.state === 'authority_notice_required').map(n => n.jurisdiction).join(',') || '-' })));
console.log(JSON.stringify({ requiringAuthorityNotice: result.requiringAuthorityNotice, total: result.assessments.length }));
