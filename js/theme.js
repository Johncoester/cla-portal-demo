// CARD THEME (John, Nov 3: "Apply it"): the card look is the DEFAULT look of the portal: light-blue top bar, thin icon-only sidebar,
// big light-grey page titles and soft grey cards with a white inset header holding one big light-blue value.
// Escape hatch: ?theme=default (before or after the #) switches back to the previous (navy redesign) look and is remembered in
// localStorage (THEME_KEY = 'default'); ?theme=cards switches the cards back on. Every rule lives in css/theme-cards.css, scoped to body.theme-cards.
export const THEME_KEY = 'cla-portal-new:theme';
const fromUrl = () => { const q = new URLSearchParams(location.search); const h = new URLSearchParams(location.hash.split('?')[1] || '');
  return h.get('theme') || q.get('theme') || ''; };
export function applyTheme() {
  const want = fromUrl();
  try { if (want === 'default' || want === 'off') localStorage.setItem(THEME_KEY, 'default'); else if (want === 'cards') localStorage.removeItem(THEME_KEY); } catch (e) { /* private mode */ }
  const on = themeOn(); if (document.body) document.body.classList.toggle('theme-cards', on); return on;
}
export function themeOn() { try { return localStorage.getItem(THEME_KEY) !== 'default'; } catch (e) { return true; } }
