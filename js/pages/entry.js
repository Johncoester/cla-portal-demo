import { raw, $, guard, options } from '../ui.js';

export async function render({ api, go }) {
  const users = await api.listDevUsers();
  const tpl = await (await fetch('partials/entry.html')).text();
  const opts = options(users, '', (x) => `${x.firstName} ${x.lastName} \u2014 ${x.role}`, (x) => x.id);
  const body = raw(tpl.replace('</select>', opts.toString() + '</select>'));
  return { title: 'Welcome', body, mount: (root) => wire(root, api, go) };
}

function wire(root, api, go) {
  $('#pickform', root).addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const who = new FormData(e.target).get('who');
    if (!who) throw new Error('Choose a sample person first.');
    await api.pickPerson(who);
    go('/dashboard');
  }));
}
