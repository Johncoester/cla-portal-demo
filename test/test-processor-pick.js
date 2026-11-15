/* PROC-2 (John, Nov 14 2026, recording "Adding a processor").
 * The Processor row opens a staff picker only for people who can edit parties.
 * Fake labels only. No network. */
import { readFileSync } from 'node:fs';
import { processorNameMissing, processorPickLabel, processorPickError } from '../js/data/processor-pick.js';

let pass = 0, fails = 0;
const ok = (c, name) => { if (c) pass++; else { fails++; console.log('FAIL', name); } };

ok(processorNameMissing('Not specified') && processorNameMissing('Unassigned') && processorNameMissing('') && processorNameMissing('  '), 'an empty Processor name counts as not assigned');
ok(!processorNameMissing('King John Admin'), 'a real name is assigned');
ok(processorPickLabel('Not specified') === 'Choose processor' && processorPickLabel('Unassigned') === 'Choose processor', 'an empty row says Choose processor');
ok(processorPickLabel('King John Admin') === 'Change processor', 'an assigned row says Change processor');
ok(processorPickError({ currentId: '', nextId: '' }) === 'Choose a staff login, or close this window.', 'saving Unassigned when nobody is assigned says what to do');
ok(processorPickError({ currentId: 'u-admin', nextId: '' }) === '', 'choosing Unassigned when someone is assigned is allowed');
ok(processorPickError({ currentId: '', nextId: 'u-sp' }) === '', 'choosing a staff login is allowed');

const deal = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(deal.includes('data-processor-editable') && deal.includes('data-pick-processor') && deal.includes('processorPickLabel') && deal.includes('updateDeal(d.id, { processorId: nextId })'), 'the Processor row saves through the same order update as Edit order details');
ok(deal.includes('Click the Processor row to assign one') && deal.includes("e.target.closest('a, button, input, label, select, textarea')"), 'the row opens the picker, and Call, Email, and Copy do not');
ok(deal.includes('canEdit: edit && staffView') && deal.includes('if (!canEdit || !api || !d) return'), 'someone who cannot edit parties does not get the picker');
ok(!deal.includes('Assign one with Edit order details'), 'the red warning no longer tells people to use a path that did nothing on the row');

console.log(fails ? `processor-pick: ${fails} failed` : `processor-pick: ${pass} passed`);
if (fails) process.exit(1);
