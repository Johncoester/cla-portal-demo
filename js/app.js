// app.js : hash router + role-aware layout (topbar, sidebar, welcome title, footer).
import { getAdapter } from './data/adapter.js';
import { html, raw, toText, esc, $, $$, toast, closeModal } from './ui.js';
import { isProcessor, isStaff, isClient, isAgent } from './data/constants.js';

const pages = {
  login: () => import('./pages/entry.js'),
  dashboard: () => import('./pages/dashboard.js'),
  orders: () => import('./pages/orders.js'),
  'orders/new': () => import('./pages/ordernew.js'),
  deal: () => import('./pages/deal.js'),
  users: () => import('./pages/users.js'),
  profile: () => import('./pages/profile.js'),
  'contact-us': () => import('./pages/contact.js'),
};

function parse() {
  const h = (location.hash || '#/').replace(/^#\/?/, '').split('?')[0]; const seg = h.split('/').filter(Boolean);
  if (!seg.length || seg[0] === 'work-queue') return { page: 'dashboard', params: {} };
  if (seg[0] === 'deals' && seg[1]) return { page: 'deal', params: { id: seg[1], tab: seg[2] || 'overview', sub: seg[3] } };
  if (seg[0] === 'orders' && seg[1] === 'new') return { page: 'orders/new', params: {} };
  if (seg[0] === 'users') return { page: 'users', params: { mode: seg[1] || 'list' } };
  return { page: seg[0], params: {} };
}
export const go = (path) => { if (location.hash === '#' + path) render(); else location.hash = path; };
export const homeFor = () => '/dashboard';
export const dashLabel = (u) => ({ 'Sales Processor': 'Work Queue', 'Sales Person': 'Team Dashboard', 'Sales Team': 'Team Dashboard', 'Transaction Coordinator': 'Dashboard', 'Buyer Agent': 'Transactions', 'Listing Agent': 'Transactions', 'Client-Buyer': 'My Closing', 'Client-Seller': 'My Closing' }[u.role]);

export function navFor(u, dealId, unread) {
  const items = [];
  const add = (id, label, href, cls) => items.push({ id, label, href, cls });
  add('dashboard', dashLabel(u), '#/dashboard', 'orders');
  add('orders', u.role === 'Transaction Coordinator' ? 'Orders' : 'Open Orders', '#/orders', 'orders');
  if (isProcessor(u.role)) { add('users/new', 'Create User', '#/users/new', 'documents'); add('users', 'User List', '#/users', 'documents'); }
  return items;
}

async function layout(u, view, route) {
  const api = await getAdapter(); const unread = await api.unreadCount();
  const dealId = route.page === 'deal' ? route.params.id : null; let deal = null;
  if (dealId) { try { deal = await api.getDeal(dealId); } catch (e) { deal = null; } }
  const cur = route.page + (route.page === 'users' && route.params.mode === 'new' ? '/new' : '');
  const core = navFor(u).map((n) => html`<li class="nav-item"><a class="nav-link ${n.cls} ${n.id === cur || (n.id === 'orders' && route.page === 'orders') ? 'active' : ''}" href="${n.href}">${n.label}</a></li>`);
  const t = route.params.tab; const link = (tab, label, cls) => html`<li class="nav-item"><a class="nav-link ${cls} ${t === tab ? 'active' : ''}" href="#/deals/${dealId}/${tab === 'overview' ? '' : tab}">${label}${tab === 'inbox' && deal && deal.unread ? html`<span class="nav-badge">${deal.unread}</span>` : ''}</a></li>`;
  const dealNav = deal ? html`<li class="nav-sep">This file</li>${link('overview', 'File Overview', 'orders')}${link('tasks', 'Tasks', 'task')}${link('inbox', 'Inbox', 'inbox')}${link('documents', 'Documents', 'documents')}${link('contacts', 'Contacts', 'contact-us')}${isClient(u.role) ? '' : link('activity', 'Activity', 'activity')}` : '';
  const contact = isStaff(u.role) ? '' : html`<li class="nav-item"><a class="nav-link contact-us ${route.page === 'contact-us' ? 'active' : ''}" href="#/contact-us">Contact Us</a></li>`;
  const sidebarHead = deal ? html`<a class="logo-home-link" href="#/deals/${deal.id}"><div class="order-heading-left"><span>${deal.fileNumber}</span></div><div class="map-div"><img class="map-pin" src="assets/img/map-icon-new.png" alt=""><p>${deal.street}<br>${deal.city}, ${deal.state}, ${deal.zip}</p></div></a>` : '';
  const topButtons = isProcessor(u.role) ? html`<a class="green-btn" href="#/orders/new">Place Order</a>` : '';
  return html`
  <div class="topbar-main"><div class="topbar-inner">
    <a class="brand" href="#${homeFor(u)}"><img src="assets/img/logo-white.png" alt="CLA Title &amp; Escrow"></a>
    <div class="topbar-right">${topButtons}
      <a class="bell" href="#/orders" title="${unread} unread message(s)"><img src="assets/img/bell_new.png" alt="Notifications"><span class="notification-num">${unread}</span></a>
      <div class="user-menu"><button class="user-btn" data-usermenu>${u.firstName} ${u.lastName} &#9662;</button>
        <ul class="user-dd" hidden><li><a href="#/profile">Profile Setting</a></li><li><a href="#" data-signout>Logout</a></li></ul></div>
    </div></div></div>
  <div class="wrapper-main">
    <div class="left-bar"><div class="logo">${sidebarHead}</div><div class="main-nav"><ul class="nav nav-pills">${core}${dealNav}${contact}</ul></div></div>
    <div class="right-bar">
      <h1 class="welcome-title">Welcome ${u.firstName} ${u.lastName} to CLATitle Portal</h1>
      ${view.crumbs ? html`<ol class="breadcrumb"><li><a href="#${homeFor(u)}"><img src="assets/img/bread-home.png" alt="">Home</a></li>${view.crumbs.map(([label, href], i) => html`<li class="${i === view.crumbs.length - 1 ? 'active' : ''}">${href ? html`<a href="${href}">${label}</a>` : label}</li>`)}</ol>` : ''}
      <div class="dev-banner">DEV BUILD &middot; FAKE DATA ONLY &middot; no real clients, no Zoho &middot; <a href="#" data-reset>reset demo data</a></div>
      <div id="view">${view.body}</div>
    </div>
    <div class="footer-bar"><span><img src="assets/img/logo-icon.png" alt="" class="foot-logo"> Copyright 2026 C.L.A Title &amp; Escrow | All Rights Reserved.</span><span>Security / Privacy Policy</span></div>
  </div>`;
}

let rendering = 0;
export async function render() {
  const my = ++rendering; const root = $('#app'); const api = await getAdapter(); const route = parse(); closeModal();
  let u = await api.getSession();
  if (!u && route.page !== 'login') { location.hash = '#/login'; return; }
  if (u && route.page === 'login') { location.hash = '#' + homeFor(u); return; }
  const loader = pages[route.page];
  if (!loader) { root.innerHTML = toText(await layout(u, { body: html`<div class="box-title"><h2>Page not found</h2></div><p>That page does not exist.</p>` }, route)); wireChrome(u); return; }
  const mod = await loader(); let view;
  try { view = await mod.render({ api, user: u, params: route.params, refresh: render, go }); }
  catch (e) { view = { crumbs: [['Not available']], body: html`<div class="box-title"><h2>Not available</h2></div><p class="err-text">${e.message}</p><p><a class="back-btn" href="#${homeFor(u)}">Back</a></p>` }; }
  if (my !== rendering) return;
  if (route.page === 'login') { root.innerHTML = toText(view.body); } else { root.innerHTML = toText(await layout(u, view, route)); wireChrome(u); }
  document.title = (view.title ? view.title + ' | ' : '') + 'CLA Title & Escrow Portal';
  if (view.mount) view.mount($('#view') || root, { api, user: u, refresh: render, go });
}
function wireChrome(u) {
  const btn = $('[data-usermenu]'); const dd = $('.user-dd');
  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); dd.hidden = !dd.hidden; });
  document.addEventListener('click', () => { if (dd) dd.hidden = true; }, { once: true });
  const so = $('[data-signout]'); if (so) so.addEventListener('click', async (e) => { e.preventDefault(); const api = await getAdapter(); await api.signOut(); location.hash = '#/login'; });
  const rs = $('[data-reset]'); if (rs) rs.addEventListener('click', async (e) => { e.preventDefault(); if (!confirm('Reset all demo data back to the 3 fake deals?')) return; const api = await getAdapter(); await api.resetDemoData(); toast('Demo data reset'); render(); });
}
window.addEventListener('hashchange', render);
render();
