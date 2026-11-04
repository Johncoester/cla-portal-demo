import { raw, $, guard, options } from '../ui.js?v=202611032037';
import { roleLabel, fileRolesLabel, isOutside } from '../data/constants.js?v=202611032037';

export async function render({ api, go }) {
  const users = await api.listDevUsers();
  const tpl = await (await fetch('partials/entry.html?v=202611032037')).text();
  const opts = options(users, '', (x) => `${x.firstName} ${x.lastName} \u2014 ${isOutside(x.role) ? `Outside user: ${fileRolesLabel(x.fileLabels || x.fileRoles)}` : roleLabel(x)}`, (x) => x.id);
  const body = raw(tpl.replace('</select>', opts.toString() + '</select>'));
  return { title: 'Welcome', body, mount: (root) => wire(root, api, go) };
}

function wire(root, api, go) {
  $('#pickform', root).addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const who = new FormData(e.target).get('who');
    if (!who) throw new Error('Choose a sample person first.');
    await api.pickPerson(who);
    // invite deep link ("Complete Requests Now"): go back to the order page that was asked for, if any
    const back = sessionStorage.getItem('cla-portal-new:return'); sessionStorage.removeItem('cla-portal-new:return');
    go(back && /^#\/deals\/[\w-]+(\/[\w-]+)?$/.test(back) ? back.slice(1) : '/dashboard');
  }));
}
