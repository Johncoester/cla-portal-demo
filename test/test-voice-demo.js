/* Grok voice stays honest until a server can mint a short-lived pass. No microphone and no made-up reply. */
import { routeAllowed } from '../js/data/locked-links.js';
import { acceptEphemeralToken, prepareVoice, realtimeSocket, sessionUpdate, stopMic, textTurn, VOICE_NOT_CONFIGURED, VOICE_URL, DEMO_INSTRUCTIONS } from '../js/data/voice-demo.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const buyer = { id: 'u-buyer', role: 'Outside user', status: 'active', isAdmin: false };
const admin = { id: 'u-admin', role: 'Super admin', status: 'active', isAdmin: true };
ok(routeAllowed(buyer, { page: 'voice-demo' }, { locked: true }) === true, 'a locked fake demo link can open the voice page');
ok(routeAllowed(buyer, { page: 'voice-demo' }, { locked: false }) === false, 'the same person without the demo link cannot');
ok(routeAllowed(admin, { page: 'voice-demo' }, { locked: false }) === false, 'a real admin session does not get the voice page');
ok(routeAllowed(admin, { page: 'voice-demo' }, { locked: true, demo: { active: true } }) === false, 'viewing a demo persona does not open voice');
ok(await prepareVoice({ window: {} }).then((r) => r.ok === false && r.message === VOICE_NOT_CONFIGURED), 'with no server flag, voice is not configured');
let asked = false;
const blocked = await prepareVoice({ window: { CLA_PORTAL_CONFIG: { voiceToken: true } }, fetch: async (url) => { asked = url; return { ok: false }; } });
ok(asked === '/api/voice-token' && blocked.message.includes('could not be reached'), 'a configured page asks only our server, then shows the error');
let bad = '';
try { acceptEphemeralToken('xai-secret-key'); } catch (e) { bad = e.message; }
ok(bad.includes('short-lived'), 'a long-lived key is refused');
const token = 'xai-realtime-client-secret-demoPass1';
let seen = null;
const ws = realtimeSocket(token, function WS(url, protocols) { seen = { url, protocols }; this.close = () => {}; });
ok(seen.url === VOICE_URL && !seen.url.includes(token) && seen.protocols[0] === `xai-client-secret.${token}`, 'the pass is a socket protocol, not part of the address');
ok(ws && sessionUpdate().session.instructions === DEMO_INSTRUCTIONS && sessionUpdate().session.tools.length === 0, 'the demo script cannot use tools');
ok(!/getDeal|listContacts|sendEmail/.test(DEMO_INSTRUCTIONS), 'the script does not ask the portal for records');
const turn = textTurn('  Is the closing Tuesday?  ');
ok(turn[0].item.content[0].text === 'Is the closing Tuesday?' && turn[1].type === 'response.create', 'typed text is a Grok turn, not a local answer');
let empty = '';
try { textTurn('   '); } catch (e) { empty = e.message; }
ok(empty === 'Type a message first.', 'an empty message is an error');
const stopped = stopMic({ stream: { getTracks: () => [{ stop() { this.stopped = true; }, stopped: false }] }, chunks: ['audio'], socket: { close() { this.closed = true; } }, context: { close() {} } });
ok(stopped.retainedChunks === 0 && stopped.tracksStopped === 1, 'stop releases the microphone and keeps nothing');
const store = { set: 0, setItem() { this.set += 1; } };
stopMic({ stream: null, chunks: [] });
ok(store.set === 0, 'stop does not write storage');
console.log(fail ? fail + ' failed' : 'voice demo passed');
if (fail) process.exit(1);
