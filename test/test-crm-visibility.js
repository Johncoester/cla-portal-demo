/* CRM visibility: an admin can change every record. Anyone else can change only a record they own. */
import { canChangeCrmRecord, splitOwnedRecords, skippedLine, CRM_LOCK_NOTE } from '../js/data/crm-visibility.js?v=202611247100';
import { editControl, archiveControl, lockNote } from '../js/pages/crm-kit.js?v=202611247100';
import { toText } from '../js/ui.js?v=202611161500';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const admin = { id: 'admin', isAdmin: true };
const ada = { id: 'ada', isAdmin: false };
const ben = { id: 'ben', isAdmin: false };
const mine = { id: 'L1', ownerId: 'ada', name: 'Mine' };
const theirs = { id: 'L2', ownerId: 'ben', name: 'Theirs' };
const none = { id: 'L3', ownerId: '', name: 'Unassigned' };

ok(canChangeCrmRecord(admin, theirs), 'an admin can change a record they do not own');
ok(canChangeCrmRecord(ada, mine), 'the owner can change their own record');
ok(!canChangeCrmRecord(ada, theirs), 'someone else cannot change a record they do not own');
ok(!canChangeCrmRecord(ada, none), 'an unassigned record is not theirs to change');
ok(!canChangeCrmRecord(null, mine), 'a signed-out person cannot change a record');

const split = splitOwnedRecords([mine, theirs, none], ada);
ok(split.owned.length === 1 && split.owned[0].id === 'L1', 'bulk keeps the owned record');
ok(split.skippedCount === 2, 'bulk counts the records that are not theirs');
ok(skippedLine(0) === '', 'no skip line when nothing was skipped');
ok(skippedLine(2) === `2 skipped. ${CRM_LOCK_NOTE}`, 'the skip line names the count and the rule');
ok(skippedLine(1).startsWith('1 skipped.'), 'one skipped record uses the singular');

const locked = toText(editControl(ada, theirs, 'data-edit-lead'));
ok(locked.includes('disabled') && locked.includes('Edit') && locked.includes('data-locked-edit'), 'Edit is greyed out on someone else\'s record');
ok(!toText(editControl(ada, mine, 'data-edit-lead')).includes('disabled'), 'Edit works on your own record');
ok(toText(editControl(admin, theirs, 'data-edit-lead')).includes('data-edit-lead') && !toText(editControl(admin, theirs, 'data-edit-lead')).includes('disabled'), 'an admin still gets Edit');

const arch = toText(archiveControl(ada, theirs, 'lead', 'L2', false));
ok(arch.includes('disabled') && arch.includes('Archive') && arch.includes('data-locked-archive'), 'Archive is greyed out when you are not the owner');
ok(toText(archiveControl(ada, mine, 'lead', 'L1', false)).includes('data-archive="lead:L1:1"'), 'the owner can archive their record');
ok(toText(lockNote(ada, theirs)).includes(CRM_LOCK_NOTE), 'the screen says only the owner or an admin can change the record');
ok(toText(lockNote(ada, mine)) === '', 'the note is hidden on a record you can change');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('crm visibility passed');
