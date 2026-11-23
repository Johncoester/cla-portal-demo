// TC-ONLY-3 (Francis Santos, Nov 23 2026): fee change and title commitment notices go to both the agent and the TC, and the
// greeting on an email moved to a TC becomes "Hello <TC first name>". The routing is in the database (test-tc-only-3-sql.sh);
// this checks the Contacts wording and the typed-email greeting.
const { tcOnlyBox } = await import('../js/data/tc-only.js');
const { swapGreeting } = await import('../supabase/functions/_shared/gmail-handlers.mjs');
let fail = 0; const ok = (c, m) => { if (c) console.log('ok ' + m); else { console.log('FAIL ' + m); fail = 1; } };
const tc = { name: 'Kim Second', email: 'kim@tc.test', hasLogin: true };
const on = tcOnlyBox({ tcOnly: true, tcs: [tc] }, 'Listing Agent', { canEdit: true, agentName: 'Rosy Coester' });
ok(/go to Kim Second instead\./.test(on.hint) && /Fee change and title commitment notices go to both Rosy Coester and the TC\./.test(on.hint), 'ticked: says fee change and title commitment notices go to both');
const off = tcOnlyBox({ tcOnly: false, tcs: [tc] }, 'Listing Agent', { canEdit: true, agentName: 'Rosy Coester' });
ok(/^When ticked,/.test(off.hint) && /go to both Rosy Coester and the TC/.test(off.hint), 'not ticked yet: says the same');
const none = tcOnlyBox({ tcOnly: false, tcs: [] }, 'Listing Agent', { canEdit: true, agentName: 'Rosy Coester' });
ok(none.hint === 'Add a Listing Agent TC for Rosy Coester first to use this.', 'no TC: the FF-108 text is unchanged');
ok(swapGreeting('<p>Hi Rosy,</p><p>Rosy\'s file</p>', 'Rosy', 'Kim') === '<p>Hello Kim,</p><p>Rosy\'s file</p>', 'typed email: "Hi Rosy," becomes "Hello Kim,", nothing else changes');
ok(swapGreeting('<p>Good afternoon Rosy,</p>', 'Rosy', 'Kim') === '<p>Hello Kim,</p>', 'any greeting word becomes Hello');
ok(swapGreeting('<p>Hi team,</p>', 'Rosy', 'Kim') === '<p>Hi team,</p>', 'a greeting without the agent\'s name is left alone');
// FF-108 follow-up: saving a TC for an agent no longer makes its own link call (the server links from the file, and skips Refinance)
{ const { saveAgentTcOnFile } = await import('../js/data/agent-tc.js');
  const calls = []; const api = { addParticipant: async (...a) => { calls.push(['add', ...a]); }, linkAgentTc: async (...a) => { calls.push(['link', ...a]); } };
  const choices = [{ value: 'Listing Agent:c-rosy', storedRole: 'Listing Agent TC' }];
  const r = await saveAgentTcOnFile(api, 'deal-r', 'c-kim', { linkedRoles: [], choice: 'Listing Agent:c-rosy', choices });
  ok(calls.some((c) => c[0] === 'add') && !calls.some((c) => c[0] === 'link') && r.linkProblem === '', 'adding a TC for an agent saves the role only; no separate link call'); }
ok(swapGreeting('<p>Hi Rosy,</p>', 'Rosy', 'A&B <x>') === '<p>Hello A&amp;B &lt;x&gt;,</p>', 'typed email: the TC name is HTML-escaped');
if (fail) process.exit(1);
console.log('tc-only-3 passed');
