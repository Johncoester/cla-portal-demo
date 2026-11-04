import { raw, $, guard, options } from '../ui.js?v=202611041824';
import { roleLabel, fileRolesLabel, isOutside } from '../data/constants.js?v=202611041824';
import { devPickerOn, PLAIN_URL_NOTICE } from '../data/locked-links.js?v=202611041824';
import { clearSessionWs } from '../workspace.js?v=202611041824';

export async function render({ api, go }) {
  // NO PICKER ON THE PUBLIC DEMO (John, Nov 4): without the test-harness flag the plain URL shows only the notice; nobody can pick a fake user here
  if (!devPickerOn()) return { title: 'CLA Title test portal', body: raw(`<div class="login-page" data-test-portal-notice><div class="login-card"><img class="login-logo" src="assets/img/login-logo-new.png" alt="C.L.A. Title &amp; Escrow"><h2>CLA Title test portal</h2><p data-notice-text>${PLAIN_URL_NOTICE}</p></div></div>`) };
  const users = await api.listDevUsers();
  const tpl = await (await fetch('partials/entry.html?v=202611041824')).text();
  const opts = options(users, '', (x) => `${x.firstName} ${x.lastName} \u2014 ${isOutside(x.role) ? `Outside user: ${fileRolesLabel(x.fileLabels || x.fileRoles)}` : roleLabel(x)}`, (x) => x.id);
  const body = raw(tpl.replace('</select>', opts.toString() + '</select>'));
  return { title: 'Welcome', body, mount: (root) => wire(root, api, go) };
}

function wire(root, api, go) {
  $('#pickform', root).addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const who = new FormData(e.target).get('who');
    if (!who) throw new Error('Choose a sample person first.');
    await api.pickPerson(who); clearSessionWs();   // John, Nov 4: every new sign-in lands on the neutral Home first
    // invite deep link ("Complete Requests Now"): go back to the order page that was asked for, if any
    const back = sessionStorage.getItem('cla-portal-new:return'); sessionStorage.removeItem('cla-portal-new:return');
    go(back && /^#\/deals\/[\w-]+(\/[\w-]+)?$/.test(back) ? back.slice(1) : '/dashboard');
  }));
}
