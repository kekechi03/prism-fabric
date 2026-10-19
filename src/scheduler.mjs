const finite = (value, name, minimum = 0) => {
  if (!Number.isFinite(value) || value < minimum) throw new TypeError(`${name} is invalid`);
  return value;
};

export function validateFleet(fleet) {
  if (!Array.isArray(fleet) || !fleet.length) throw new TypeError('A nonempty fleet is required');
  const ids = new Set();
  for (const pool of fleet) {
    if (!pool.id || ids.has(pool.id)) throw new TypeError('Pool IDs must be unique');
    ids.add(pool.id);
    for (const name of ['totalSlots', 'availableSlots', 'memoryGiB', 'queueMs', 'startupMs', 'costPerSlotHour']) finite(pool[name], name);
    if (!Number.isSafeInteger(pool.totalSlots) || !Number.isSafeInteger(pool.availableSlots) || pool.availableSlots > pool.totalSlots) throw new TypeError('Invalid slot capacity');
    if (!Array.isArray(pool.models)) throw new TypeError('Pool model cache is required');
  }
}

export function rankPools(fleet, request) {
  validateFleet(fleet);
  if (!request?.model || !Number.isSafeInteger(request.slots) || request.slots < 1) throw new TypeError('Invalid capacity request');
  finite(request.memoryGiB, 'memoryGiB', 1);
  finite(request.maxQueueMs, 'maxQueueMs');
  if (!Array.isArray(request.allowedRegions) || !request.allowedRegions.length) throw new TypeError('Region policy is required');
  return fleet.map(pool => {
    const warm = pool.models.includes(request.model);
    const readyMs = pool.queueMs + (warm ? 0 : pool.startupMs);
    const rejected = [
      ...(!request.allowedRegions.includes(pool.region) ? ['region_policy'] : []),
      ...(pool.availableSlots < request.slots ? ['insufficient_slots'] : []),
      ...(pool.memoryGiB < request.memoryGiB ? ['insufficient_memory'] : []),
      ...(readyMs > request.maxQueueMs ? ['queue_deadline'] : [])
    ];
    // A reproducible policy score, not a measured performance prediction.
    const cost = request.slots * pool.costPerSlotHour;
    const score = readyMs + cost * 250 + (warm ? 0 : 500);
    return { pool: pool.id, region: pool.region, warm, readyMs, estimatedSlotCostPerHour: cost,
      score, eligible: rejected.length === 0, rejected };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.score - b.score || a.pool.localeCompare(b.pool));
}

export function planBatch(fleet, requests) {
  validateFleet(fleet);
  const remaining = structuredClone(fleet);
  const ids = new Set();
  const assignments = requests.map(request => {
    if (!request.id || ids.has(request.id)) throw new TypeError('Request IDs must be unique');
    ids.add(request.id);
    const ranked = rankPools(remaining, request);
    const selected = ranked.find(pool => pool.eligible);
    if (!selected) return { requestId: request.id, state: 'queued', reasons: ranked };
    remaining.find(pool => pool.id === selected.pool).availableSlots -= request.slots;
    return { requestId: request.id, state: 'admitted', placement: selected, slots: request.slots };
  });
  return { assignments, remaining, admitted: assignments.filter(a => a.state === 'admitted').length };
}
