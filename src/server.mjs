import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { planBatch } from './scheduler.mjs';
import { LeaseCodec } from './leases.mjs';

export async function createPreviewServer() {
  const fleet = JSON.parse(await readFile(new URL('../fixtures/fleet.json', import.meta.url)));
  const leases = new LeaseCodec(randomBytes(32));
  const respond = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(body) + '\n');
  };
  return createServer(async (req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && path === '/healthz') return respond(res, 200, { status: 'ok', mode: 'local-preview' });
    if (req.method === 'GET' && path === '/v1/pools') return respond(res, 200, { pools: fleet, source: 'synthetic_fixture' });
    if (req.method !== 'POST' || path !== '/v1/plans') return respond(res, 404, { error: 'route_not_found' });
    const parts = [];
    let length = 0;
    try {
      for await (const part of req) {
        length += part.length;
        if (length > 16384) { respond(res, 413, { error: 'request_too_large' }); req.resume(); return; }
        parts.push(part);
      }
      const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
      if (!Array.isArray(body.requests) || body.requests.length < 1 || body.requests.length > 32) throw new Error('Invalid batch');
      const plan = planBatch(fleet, body.requests);
      const leasePreviews = plan.assignments.filter(a => a.state === 'admitted').map(a => leases.issue({
        pool: a.placement.pool, model: body.requests.find(r => r.id === a.requestId).model, slots: a.slots
      }));
      return respond(res, 200, { mode: 'local-preview', plan, leasePreviews });
    } catch { return respond(res, 400, { error: 'invalid_capacity_request' }); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createPreviewServer();
  server.listen(4818, '127.0.0.1', () => console.log('Prism Fabric preview: http://127.0.0.1:4818'));
}
