/* MF-068 (Matt, Nov 25 2026): Order Status milestones can be checked off independently. */
import { emptyMilestones, milestonesFromStage, parseMilestones, derivedStage, toggleMilestone, milestonesDoneCount } from '../js/data/milestones.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(milestonesFromStage(5).filter(Boolean).length === 6 && milestonesFromStage(5)[5] && !milestonesFromStage(5)[6], 'backfill marks 0 through the current step complete');
ok(derivedStage(milestonesFromStage(5)) === 5, 'the stored stage is the highest completed step');
ok(derivedStage(emptyMilestones()) === 0 && milestonesDoneCount(emptyMilestones()) === 0, 'a file with nothing checked still has derived stage 0');
const mid = toggleMilestone(emptyMilestones(), 4);
ok(mid[4] && !mid[0] && !mid[3] && derivedStage(mid) === 4 && milestonesDoneCount(mid) === 1, 'checking a later step does not auto-complete earlier ones');
ok(toggleMilestone(mid, 4)[4] === false, 'the same step can be unchecked');
ok(parseMilestones(undefined, 3)[3] && parseMilestones([true, false, false, false, false, false, false, false, false, false], 9)[0] && !parseMilestones([true, false, false, false, false, false, false, false, false, false], 9)[9], 'a saved set is used as-is; a missing set falls back to the linear stage');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const deal = await api.createDeal({ street: '9 Milestone Rd', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc' });
await api.setStage(deal.id, 5);
let d = await api.getDeal(deal.id);
ok(d.milestonesDone[5] && !d.milestonesDone[0] && !d.milestonesDone[4] && d.stage === 5 && d.status === 'Open', 'clicking step 5 checks only step 5 and leaves the file Open');
await api.setStage(deal.id, 0);
await api.setStage(deal.id, 9);
d = await api.getDeal(deal.id);
ok(d.milestonesDone[0] && d.milestonesDone[5] && d.milestonesDone[9] && d.stage === 9 && d.status === 'Closed', 'checking Disbursed Funds closes an open order; earlier checks stay');
await api.setStage(deal.id, 9);
d = await api.getDeal(deal.id);
ok(!d.milestonesDone[9] && d.status === 'Closed' && d.stage === 5, 'unchecking Disbursed Funds does not reopen the file; the derived stage falls back to the next highest check');

console.log(fail ? fail + ' failed' : 'mf-068 independent milestones passed');
if (fail) process.exit(1);
