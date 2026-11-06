import { html, $, guard } from '../ui.js?v=202611062001';

// Super admin only. The list and the session come from the database. Mock identity links are not used here.
export async function render({ api, go }) {
  if (!api || api.mode !== 'supabase' || !api.listDemoPersonas) {
    return { title: 'Demo mode', body: html`<div class="box-title" data-demo-picker><h2>Demo mode</h2></div><p>Demo mode is available after you sign in to the portal.</p>` };
  }
  let people = [];
  try { people = await api.listDemoPersonas(); }
  catch (e) { return { title: 'Demo mode', body: html`<div class="box-title" data-demo-picker><h2>Demo mode</h2></div><p class="err-text">${e.message}</p>` }; }
  const cards = people.map((p) => html`<button type="button" class="m-btn" data-demo-pick="${p.id}">${p.firstName} ${p.lastName} <span class="muted">— ${p.portalRole || p.role}</span></button>`);
  return {
    title: 'Demo mode',
    body: html`<div data-demo-picker><div class="box-title"><h2>Demo mode</h2></div><p>Choose a seeded demo user. You will see the portal as that person, including only demo files. You cannot change anything. The view ends after 30 minutes, or when you go back to your account.</p><div class="stack" data-demo-people>${cards.length ? cards : html`<p>No seeded demo users are available.</p>`}</div><p class="err-text" data-form-err></p></div>`,
    mount(root) { wire(root, api, go); },
  };
}

function wire(root, api, go) {
  root.querySelectorAll('[data-demo-pick]').forEach((btn) => btn.addEventListener('click', guard(async () => {
    const err = $('[data-form-err]', root); if (err) err.textContent = '';
    await api.startDemoView(btn.getAttribute('data-demo-pick'));
    go('/dashboard');
  })));
}
