/* JC-MOBILE-1 (John Coester, mobile video Nov 23 2026 3:34 PM ET, confirmed 5:04 PM ET).
 * On a phone, the This File menu starts behind a button in the page flow and opens as a drawer.
 * The computer sidebar is unchanged. Source checks only. No database. */
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/portal.css', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../css/theme-cards.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const desktopCss = css.split(/@media\s*\(\s*max-width:\s*860px\s*\)/)[0];
const mobileBlocks = [...css.matchAll(/@media\s*\(\s*max-width:\s*860px\s*\)\s*\{([\s\S]*?)(?:\n\}|\n@media)/g)].map((m) => m[1]);
const mobileCss = mobileBlocks.join('\n');
ok(mobileBlocks.length > 0, 'portal.css has a phone breakpoint at 860px');

ok(app.includes('data-this-file-toggle') && app.includes('aria-controls="this-file-nav"') && app.includes('aria-expanded="false"'), 'This File is a named button that starts closed');
ok(app.includes('id="this-file-nav" data-this-file-nav') && app.includes('data-this-file-close') && app.includes('data-this-file-backdrop'), 'the drawer, Close button, and backdrop are in the shell');
ok(app.includes('${dealNav}') && app.includes('${thisFileNav}'), 'file tabs stay inside the This File drawer wrap');
ok(app.includes('wireThisFileNav();') && app.includes('function wireThisFileNav()'), 'the drawer is wired when the shell is drawn');
ok(app.includes('setOpen(false)'), 'each visit starts with the drawer closed');
ok(app.includes("e.key === 'Escape'") && app.includes("e.target.closest('a.nav-link')") && app.includes('data-this-file-close') && app.includes('data-this-file-backdrop'), 'Close, a file tab, the backdrop, and Escape close the drawer');
ok(app.includes("panel.classList.toggle('is-open', open)") && app.includes('back.hidden = !open'), 'opening adds is-open and shows the backdrop');
ok(app.includes("document.body.classList.toggle('this-file-nav-open', open)"), 'the page does not scroll under the open drawer');
ok(app.includes('data-file-nav-toggle') && app.includes('id="global-nav" data-global-nav hidden') && app.includes("btn.textContent = open ? 'Hide portal menu' : 'Show portal menu'"), 'Show portal menu still only opens the portal menu');
ok(app.includes("data-client-shell") && !/data-client-shell[\s\S]{0,800}data-this-file-toggle/.test(app), 'a buyer or seller light shell does not get the This File drawer');

ok(desktopCss.includes('.this-file-tool, .this-file-nav-head, .this-file-backdrop { display: none; }'), 'on a computer the This File button, drawer heading, and backdrop stay hidden');
ok(desktopCss.includes('.this-file-nav { display: contents; }') && desktopCss.includes('.this-file-nav > .nav { display: contents; }'), 'on a computer the file links stay in the left sidebar');
ok(desktopCss.includes('.left-bar { position: fixed;') && desktopCss.includes('.right-bar { margin-left: var(--sidebar-w);'), 'the computer sidebar and page layout are unchanged');
ok(!desktopCss.includes('.order-header {') || /(?:^|\n)\.order-header \{[^}]*position:\s*sticky/.test(desktopCss), 'the computer order header is still sticky (unchanged in this change)');

ok(mobileCss.includes('.this-file-toggle { display: inline-flex') && mobileCss.includes('min-height: 44px'), 'on a phone the This File button is in the page and large enough to tap');
ok(mobileCss.includes('.this-file-nav { display: none; }'), 'on a phone the file menu is hidden until the button is tapped');
ok(/\.this-file-nav\.is-open\s*\{[^}]*position:\s*fixed/.test(mobileCss) && /\.this-file-nav\.is-open\s*\{[^}]*z-index:\s*40/.test(mobileCss), 'the open menu is a drawer, not a block sitting on the page');
ok(/\.this-file-backdrop:not\(\[hidden\]\)\s*\{[^}]*position:\s*fixed/.test(mobileCss), 'the open drawer has a dimmed backdrop');
ok(mobileCss.includes('body.this-file-nav-open { overflow: hidden; }'), 'the page behind the open drawer does not scroll');
ok(css.includes('.left-bar { position: static; width: 100%;') || mobileCss.includes('display: contents'), 'on a phone the closed sidebar does not stay a fixed column over the file');

ok(theme.includes('body.theme-cards .this-file-nav.is-open { background: var(--tc-side); }'), 'the card theme drawer uses the sidebar color');

ok(html.includes('js/app.js?v=202611314300') && html.includes('css/portal.css?v=202611310300') && html.includes('css/theme-cards.css?v=202611302300'), 'the published page loads the updated shell, layout styles, and card theme');
ok(html.includes('testportal.clatitle.com') === false && readFileSync(new URL('../CNAME', import.meta.url), 'utf8').trim() === 'testportal.clatitle.com', 'the custom domain file is unchanged');

console.log(fail ? fail + ' failed' : 'mobile this-file nav passed');
if (fail) process.exit(1);
