// Workflows (John, Nov 6). A workflow is an ordered flowchart of existing task templates.
// Admin and Super admin edit them. CLA staff may read them. Nothing here copies tasks onto a file.
//
// Later, when a person is added to a file, matchWorkflow({ role, fileType: deal.transactionType, state: deal.state })
// can pick the most specific active assignment and copy that workflow's steps in position order.
// A step with dependsOn stays waiting until the copy of that earlier step is done.
// Two steps that depend on the same earlier step run side by side.
// Do not call this from createDeal or addParticipant until John asks for it.
import { DEAL_ROLES, TX_TYPES, US_STATES } from './constants.js?v=202611061918';

export const WORKFLOW_AUDIENCES = [['processing', 'Processing'], ['client', 'Client']];
const AUDIENCE_IDS = WORKFLOW_AUDIENCES.map(([id]) => id);
const READ_ROLES = ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'];

export const canEditWorkflows = (u) => !!(u && u.isAdmin && (u.status || 'active') === 'active');
export function canReadWorkflows(u) {
  if (!u || (u.status || 'active') !== 'active') return false;
  return !!(u.isAdmin || READ_ROLES.includes(u.role));
}

const latestTemplate = (d, code) => (d.taskTemplates || []).filter((t) => t.code === code && !t.retiredAt).sort((a, b) => b.version - a.version)[0] || null;

function addSeed(d, spec) {
  if (spec.steps.some((st) => !latestTemplate(d, st.code))) return;
  const wfId = spec.id;
  d.workflows.push({ id: wfId, name: spec.name, description: spec.description, active: true, audience: spec.audience, createdBy: 'u-admin', createdAt: '2026-11-06T15:00:00Z', updatedBy: 'u-admin', updatedAt: '2026-11-06T15:00:00Z' });
  const ids = spec.steps.map((_, i) => `${wfId}-s${i + 1}`);
  spec.steps.forEach((st, i) => {
    const tpl = latestTemplate(d, st.code);
    d.workflowSteps.push({ id: ids[i], workflowId: wfId, taskTemplateId: tpl.id, position: i + 1, dependsOn: st.after == null ? null : ids[st.after] });
  });
  spec.assignments.forEach((a, i) => d.workflowAssignments.push({ id: `${wfId}-a${i + 1}`, workflowId: wfId, role: a.role || '', fileType: a.fileType || '', state: a.state || '' }));
}

/* Fake examples so mock mode has a processing flowchart and separate buyer / seller client flowcharts. */
export function ensureWorkflows(d) {
  if (!d) return d;
  if (!Array.isArray(d.workflows)) d.workflows = [];
  if (!Array.isArray(d.workflowSteps)) d.workflowSteps = [];
  if (!Array.isArray(d.workflowAssignments)) d.workflowAssignments = [];
  if (d.workflowsSeeded) return d;
  if (!d.workflows.length) {
    addSeed(d, { id: 'wf-processing-purchase', name: 'Processing — Purchase', audience: 'processing', description: 'The order a processor works a purchase file. Title vesting and the home warranty run side by side after lender information.',
      steps: [{ code: 'personal_info' }, { code: 'lender_info', after: 0 }, { code: 'title_vesting', after: 1 }, { code: 'home_warranty', after: 1 }, { code: 'commissions', after: 2 }],
      assignments: [{ role: 'Processor', fileType: 'Purchase', state: '' }] });
    addSeed(d, { id: 'wf-processing-refinance', name: 'Processing — Refinance', audience: 'processing', description: 'A shorter processor order for a refinance. No seller tasks.',
      steps: [{ code: 'personal_info' }, { code: 'lender_info', after: 0 }],
      assignments: [{ role: 'Processor', fileType: 'Refinance', state: '' }] });
    addSeed(d, { id: 'wf-client-buyer-purchase', name: 'Client — Buyer purchase', audience: 'client', description: 'Buyer tasks for a purchase. Title vesting and lender information both follow personal information.',
      steps: [{ code: 'id_upload' }, { code: 'personal_info', after: 0 }, { code: 'title_vesting', after: 1 }, { code: 'lender_info', after: 1 }, { code: 'home_warranty', after: 3 }],
      assignments: [{ role: 'Client-Buyer', fileType: 'Purchase', state: '' }] });
    addSeed(d, { id: 'wf-client-seller-purchase', name: 'Client — Seller purchase', audience: 'client', description: 'Seller tasks for a purchase. HOA and the outstanding mortgage run side by side.',
      steps: [{ code: 'id_upload' }, { code: 'personal_info', after: 0 }, { code: 'hoa_info', after: 1 }, { code: 'mortgage_info', after: 1 }, { code: 'forwarding_address', after: 2 }, { code: 'seller_proceeds', after: 3 }],
      assignments: [{ role: 'Client-Seller', fileType: 'Purchase', state: '' }] });
    addSeed(d, { id: 'wf-client-buyer-refinance', name: 'Client — Buyer refinance', audience: 'client', description: 'Borrower tasks for a refinance.',
      steps: [{ code: 'id_upload' }, { code: 'personal_info', after: 0 }, { code: 'lender_info', after: 1 }],
      assignments: [{ role: 'Client-Buyer', fileType: 'Refinance', state: '' }] });
  }
  d.workflowsSeeded = true;
  return d;
}

export function presentWorkflows(db) {
  const templates = db.taskTemplates || [];
  return (db.workflows || []).map((w) => ({
    id: w.id, name: w.name, description: w.description || '', active: w.active !== false, audience: w.audience, updatedAt: w.updatedAt || null,
    steps: (db.workflowSteps || []).filter((s) => s.workflowId === w.id).sort((a, b) => a.position - b.position).map((s) => {
      const t = templates.find((z) => z.id === s.taskTemplateId) || {};
      return { id: s.id, taskTemplateId: s.taskTemplateId, position: s.position, dependsOn: s.dependsOn || null, templateCode: t.code || '', templateTitle: t.title || '', templateVersion: t.version || null };
    }),
    assignments: (db.workflowAssignments || []).filter((a) => a.workflowId === w.id).map((a) => ({ id: a.id, role: a.role || '', fileType: a.fileType || '', state: a.state || '' })),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export function assignmentScore(a, query) {
  const role = a.role || '';
  const fileType = a.fileType || '';
  const state = String(a.state || '').toUpperCase();
  const qr = query.role || '';
  const qf = query.fileType || '';
  const qs = String(query.state || '').toUpperCase();
  if (role && role !== qr) return null;
  if (fileType && fileType !== qf) return null;
  if (state && state !== qs) return null;
  return (role ? 4 : 0) + (fileType ? 2 : 0) + (state ? 1 : 0);
}

/* Most specific active assignment wins. A blank role, file type, or state means any. Equal scores pick the name that sorts first. */
export function matchWorkflow(workflows, query = {}) {
  let best = null; let bestScore = -1;
  for (const w of workflows || []) {
    if (w.active === false) continue;
    for (const a of w.assignments || []) {
      const score = assignmentScore(a, query);
      if (score == null) continue;
      if (!best || score > bestScore || (score === bestScore && String(w.name).localeCompare(best.name) < 0)) { best = w; bestScore = score; }
    }
  }
  return best;
}

/* Columns are the flowchart ranks. Steps that share a parent sit in the same column (parallel). */
export function layoutWorkflow(steps) {
  const list = [...(steps || [])].sort((a, b) => a.position - b.position);
  const byId = new Map(list.map((s) => [s.id, s]));
  const col = new Map();
  const visiting = new Set();
  const depth = (id) => {
    if (col.has(id)) return col.get(id);
    if (visiting.has(id)) throw new Error('A workflow step cannot depend on itself through a loop.');
    visiting.add(id);
    const parent = byId.get(id) && byId.get(id).dependsOn;
    const n = !parent || !byId.has(parent) ? 0 : depth(parent) + 1;
    visiting.delete(id);
    col.set(id, n);
    return n;
  };
  list.forEach((s) => depth(s.id));
  const max = list.length ? Math.max(...col.values()) : -1;
  const columns = [];
  for (let i = 0; i <= max; i++) columns.push(list.filter((s) => col.get(s.id) === i));
  const edges = list.filter((s) => s.dependsOn && byId.has(s.dependsOn)).map((s) => ({ from: s.dependsOn, to: s.id }));
  return { columns, edges };
}

export function addStep(steps, template, newId) {
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const prev = ordered[ordered.length - 1];
  return [...ordered, { id: newId, taskTemplateId: template.id, templateCode: template.code, templateTitle: template.title, templateVersion: template.version, position: ordered.length + 1, dependsOn: prev ? prev.id : null }];
}

export function removeStep(steps, id) {
  const left = steps.filter((s) => s.id !== id).sort((a, b) => a.position - b.position).map((s, i) => ({ ...s, position: i + 1, dependsOn: s.dependsOn === id ? null : s.dependsOn }));
  const pos = new Map(left.map((s) => [s.id, s.position]));
  return left.map((s) => (s.dependsOn && (!pos.has(s.dependsOn) || pos.get(s.dependsOn) >= s.position) ? { ...s, dependsOn: null } : s));
}

export function moveStep(steps, id, dir) {
  const ordered = [...steps].sort((a, b) => a.position - b.position).map((s) => ({ ...s }));
  const i = ordered.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ordered.length) return ordered;
  const ap = ordered[i].position; ordered[i].position = ordered[j].position; ordered[j].position = ap;
  const next = ordered.sort((a, b) => a.position - b.position);
  const pos = new Map(next.map((s) => [s.id, s.position]));
  return next.map((s) => (s.dependsOn && (!pos.has(s.dependsOn) || pos.get(s.dependsOn) >= s.position) ? { ...s, dependsOn: null } : s));
}

export function commitWorkflow(db, user, input) {
  if (!canEditWorkflows(user)) throw new Error('Only an Admin or Super admin can edit workflows.');
  const name = String(input.name || '').trim();
  if (name.length < 1 || name.length > 80) throw new Error('Workflow name must be 1 to 80 characters.');
  const description = String(input.description == null ? '' : input.description).trim();
  if (description.length > 500) throw new Error('Description must be 500 characters or fewer.');
  const audience = String(input.audience || '').trim();
  if (!AUDIENCE_IDS.includes(audience)) throw new Error('Audience must be processing or client.');
  const active = input.active !== false && input.active !== 'false';
  if (!Array.isArray(input.steps)) throw new Error('Steps must be a list.');
  if (input.steps.length > 40) throw new Error('A workflow can have at most 40 steps.');
  const templates = db.taskTemplates || [];
  const seen = new Set();
  const steps = input.steps.map((s) => {
    const key = String(s.id || s.key || '').trim();
    if (!key || seen.has(key)) throw new Error('Each step needs its own key.');
    seen.add(key);
    const taskTemplateId = String(s.taskTemplateId || '').trim();
    const tpl = templates.find((t) => t.id === taskTemplateId);
    if (!tpl) throw new Error('Each step must use an existing task template.');
    if (tpl.retiredAt) throw new Error('That task is retired. Pick a current task template.');
    const position = Number(s.position);
    if (!Number.isInteger(position) || position < 1) throw new Error('Each step needs a position.');
    const dependsOn = s.dependsOn ? String(s.dependsOn) : null;
    return { key, taskTemplateId, position, dependsOn };
  });
  if (new Set(steps.map((s) => s.position)).size !== steps.length) throw new Error('Two steps cannot share a position.');
  for (const s of steps) {
    if (!s.dependsOn) continue;
    if (s.dependsOn === s.key) throw new Error('A step cannot depend on itself.');
    const parent = steps.find((p) => p.key === s.dependsOn);
    if (!parent || parent.position >= s.position) throw new Error('A step can only depend on an earlier step in this workflow.');
  }
  if (!Array.isArray(input.assignments)) throw new Error('Assignments must be a list.');
  const assignments = [];
  const asgSeen = new Set();
  for (const a of input.assignments) {
    const role = String(a.role || '').trim();
    const fileType = String(a.fileType || '').trim();
    const state = String(a.state || '').trim().toUpperCase();
    if (role && !DEAL_ROLES.includes(role)) throw new Error('Unknown role for a workflow assignment.');
    if (fileType && !TX_TYPES.includes(fileType)) throw new Error('File type must be Purchase, Refinance, or any.');
    if (state && !US_STATES.includes(state)) throw new Error('State must be a 2-letter code or blank.');
    const k = `${role}|${fileType}|${state}`;
    if (asgSeen.has(k)) throw new Error('That role, file type, and state is already on this workflow.');
    asgSeen.add(k);
    assignments.push({ role, fileType, state });
  }
  const id = input.id ? String(input.id) : '';
  if (active) {
    for (const other of (db.workflows || []).filter((w) => w.active !== false && w.id !== id)) {
      for (const a of (db.workflowAssignments || []).filter((z) => z.workflowId === other.id)) {
        if (asgSeen.has(`${a.role || ''}|${a.fileType || ''}|${a.state || ''}`)) throw new Error('Another active workflow already applies to that role, file type, and state.');
      }
    }
  }
  if (!Array.isArray(db.workflows)) db.workflows = [];
  if (!Array.isArray(db.workflowSteps)) db.workflowSteps = [];
  if (!Array.isArray(db.workflowAssignments)) db.workflowAssignments = [];
  let wfId = id;
  const stamp = new Date().toISOString();
  if (!wfId) {
    db.seq = (db.seq || 100) + 1;
    wfId = `wf-${db.seq}`;
    db.workflows.push({ id: wfId, name, description, active, audience, createdBy: user.id, createdAt: stamp, updatedBy: user.id, updatedAt: stamp });
  } else {
    const wf = db.workflows.find((w) => w.id === wfId);
    if (!wf) throw new Error('Workflow not found.');
    Object.assign(wf, { name, description, active, audience, updatedBy: user.id, updatedAt: stamp });
  }
  db.workflowSteps = db.workflowSteps.filter((s) => s.workflowId !== wfId);
  db.workflowAssignments = db.workflowAssignments.filter((a) => a.workflowId !== wfId);
  const idMap = new Map();
  [...steps].sort((a, b) => a.position - b.position).forEach((s) => {
    db.seq = (db.seq || 100) + 1;
    const sid = `${wfId}-s${s.position}-${db.seq}`;
    idMap.set(s.key, sid);
    db.workflowSteps.push({ id: sid, workflowId: wfId, taskTemplateId: s.taskTemplateId, position: s.position, dependsOn: null });
  });
  for (const s of steps) {
    const row = db.workflowSteps.find((z) => z.id === idMap.get(s.key));
    row.dependsOn = s.dependsOn ? idMap.get(s.dependsOn) || null : null;
  }
  assignments.forEach((a, i) => db.workflowAssignments.push({ id: `${wfId}-a${i + 1}`, workflowId: wfId, role: a.role, fileType: a.fileType, state: a.state }));
  return wfId;
}
