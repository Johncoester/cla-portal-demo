/* MF-086 (Matt, Nov 27): bell notification messages must be readable at phone width (390px). */
import { readFileSync } from 'node:fs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const css = readFileSync(new URL('../css/portal.css', import.meta.url), 'utf8');
ok(/@media \(max-width:\s*480px\)/.test(css) && css.includes('.notif-dd') && css.includes('position: fixed'), 'on a narrow screen the notification menu is fixed under the top bar');
ok(css.includes('overflow-wrap: anywhere') && css.includes('.notif-list a'), 'notification text wraps instead of running off the screen');
const narrow = css.slice(css.search(/@media \(max-width:\s*480px\)/), css.search(/@media \(max-width:\s*480px\)/) + 800);
ok(narrow.includes('left: 8px') && narrow.includes('right: 8px') && narrow.includes('width: auto'), 'the menu uses the screen width at 390px');
ok(/\.topbar-main \{[^}]*overflow:\s*visible/.test(css), 'the top bar does not clip the open menu');
console.log(fail ? `mf-086: ${fail} failed` : 'mf-086: passed');
if (fail) process.exit(1);
