import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { assessBatch } from './triage.mjs';
import { ApprovalCodec } from './approvals.mjs';

export async function createPreviewServer() {
  const read = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url)));
  const incidents = await read('incidents');
  const jurisdictions = await read('jurisdictions');
  const approvals = new ApprovalCodec(randomBytes(32));
  const respond = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(body) + '\n');
  };
  return createServer(async (req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && path === '/healthz') return respond(res, 200, { status: 'ok', mode: 'local-preview' });
    if (req.method === 'GET' && path === '/v1/incidents') return respond(res, 200, { incidents, source: 'synthetic_fixture' });
    if (req.method !== 'POST' || path !== '/v1/assessments') return respond(res, 404, { error: 'route_not_found' });
    const parts = [];
    let length = 0;
    try {
      for await (const part of req) {
        length += part.length;
        if (length > 16384) { respond(res, 413, { error: 'request_too_large' }); req.resume(); return; }
        parts.push(part);
      }
      const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
      if (!Array.isArray(body.incidents) || body.incidents.length < 1 || body.incidents.length > 32) throw new Error('Invalid batch');
      const result = assessBatch(body.incidents, jurisdictions);
      const approvalPreviews = result.assessments
        .filter(a => a.notifications.some(n => n.state === 'authority_notice_required'))
        .map(a => approvals.issue({ incidentId: a.incidentId, action: 'notice.draft' }));
      return respond(res, 200, { mode: 'local-preview', result, approvalPreviews });
    } catch { return respond(res, 400, { error: 'invalid_incident_batch' }); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createPreviewServer();
  server.listen(4818, '127.0.0.1', () => console.log('Prism Fabric preview: http://127.0.0.1:4818'));
}
