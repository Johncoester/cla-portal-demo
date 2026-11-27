/* JC-MOBILE-2 (John Coester, mobile video Nov 23 2026 3:34 PM ET, confirmed 5:04 PM ET).
 * On a phone the order header scrolls away with the page. On a computer it stays pinned.
 * Source checks only. No database. */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/portal.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const headerRule = (css.match(/(?:^|\n)\.order-header \{[^}]+\}/) || [])[0] || '';
const mobileBlocks = [...css.matchAll(/@media\s*\(\s*max-width:\s*860px\s*\)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
const mobileCss = mobileBlocks.join('\n');
ok(mobileBlocks.length > 0, 'portal.css has a phone breakpoint at 860px');

ok(/position:\s*sticky/.test(headerRule) && /top:\s*var\(--topbar-h\)/.test(headerRule), 'on a computer the order header stays pinned under the top bar');
ok(!/position:\s*static/.test(headerRule), 'the computer rule does not un-pin the header');

ok(/\.order-header(?:,[^\{]+)?\s*\{[^}]*position:\s*static/.test(mobileCss), 'on a phone the order header is not sticky and scrolls away with the page');
ok(mobileCss.includes('.order-header, body.theme-cards .order-header { position: static; top: auto; z-index: auto; }') || /\.order-header,\s*body\.theme-cards \.order-header\s*\{[^}]*position:\s*static/.test(mobileCss), 'the card theme uses the same un-pinned header on a phone');
ok(/JC-MOBILE-2/.test(css), 'the phone header rule is the JC-MOBILE-2 change');

ok(html.includes('css/portal.css?v=202611314500') && html.includes('js/app.js?v=202611314800'), 'the published page loads the updated layout styles and keeps the current shell');
ok(html.includes('testportal.clatitle.com') === false && readFileSync(new URL('../CNAME', import.meta.url), 'utf8').trim() === 'testportal.clatitle.com', 'the custom domain file is unchanged');

console.log(fail ? fail + ' failed' : 'mobile order header passed');
if (fail) process.exit(1);
