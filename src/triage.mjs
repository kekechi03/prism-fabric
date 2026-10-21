// Illustrative triage policy. Not legal advice and not a statement about any real incident.
export const CATEGORY_WEIGHT = Object.freeze({
  identifier: 1, contact: 1, location: 2, financial: 4, credential: 4, government_id: 5, health: 5
});
const HOUR_MS = 3600000;
const SEVERITY = ['low', 'medium', 'high', 'critical'];

export function validateIncident(incident) {
  if (!incident?.id || typeof incident.id !== 'string') throw new TypeError('Incident ID is required');
  if (!Number.isFinite(Date.parse(incident.detectedAt))) throw new TypeError('detectedAt must be an ISO timestamp');
  if (!Array.isArray(incident.jurisdictions) || !incident.jurisdictions.length) throw new TypeError('At least one jurisdiction is required');
  const data = incident.dataset;
  if (!data || !Number.isSafeInteger(data.records) || data.records < 0) throw new TypeError('dataset.records is invalid');
  if (!Array.isArray(data.categories) || !data.categories.length || data.categories.some(c => !(c in CATEGORY_WEIGHT))) throw new TypeError('dataset.categories is invalid');
  if (typeof data.encrypted !== 'boolean' || typeof data.malicious !== 'boolean') throw new TypeError('dataset flags are invalid');
}

export function exposureScore({ records, categories, encrypted, malicious }) {
  const weight = categories.reduce((sum, category) => sum + CATEGORY_WEIGHT[category], 0);
  // A reproducible heuristic: sensitivity grows with the category weight and, slowly, with volume.
  const raw = weight * (1 + Math.log10(records + 1)) * (encrypted ? 0.4 : 1) * (malicious ? 1.5 : 1);
  return Math.round(raw * 10) / 10;
}

export function severityFor(score) {
  return SEVERITY[score < 5 ? 0 : score < 15 ? 1 : score < 30 ? 2 : 3];
}

export function assessIncident(incident, jurisdictions) {
  validateIncident(incident);
  const score = exposureScore(incident.dataset);
  const severity = severityFor(score);
  const detected = Date.parse(incident.detectedAt);
  const notifications = incident.jurisdictions.map(code => {
    const rule = jurisdictions[code];
    if (!rule) return { jurisdiction: code, state: 'unconfigured', reasons: ['no_rule_for_jurisdiction'] };
    const reasons = [];
    if (SEVERITY.indexOf(severity) >= 1) reasons.push('severity_at_least_medium');
    if (incident.dataset.records >= rule.minRecords && !incident.dataset.encrypted) reasons.push('record_threshold');
    const individuals = SEVERITY.indexOf(severity) >= 2 || (rule.individualsAlways && reasons.length > 0);
    return {
      jurisdiction: code, authority: rule.authority, state: reasons.length ? 'authority_notice_required' : 'monitor',
      authorityDueAt: reasons.length ? new Date(detected + rule.authorityHours * HOUR_MS).toISOString() : null,
      individualsRequired: reasons.length > 0 && individuals, reasons
    };
  });
  return { incidentId: incident.id, score, severity, notifications };
}

export function assessBatch(incidents, jurisdictions) {
  const ids = new Set();
  const assessments = incidents.map(incident => {
    if (ids.has(incident?.id)) throw new TypeError('Incident IDs must be unique');
    ids.add(incident.id);
    return assessIncident(incident, jurisdictions);
  }).sort((a, b) => SEVERITY.indexOf(b.severity) - SEVERITY.indexOf(a.severity) || b.score - a.score || a.incidentId.localeCompare(b.incidentId));
  return { assessments, requiringAuthorityNotice: assessments.filter(a => a.notifications.some(n => n.state === 'authority_notice_required')).length };
}
