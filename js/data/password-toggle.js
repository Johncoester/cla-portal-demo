/* FF-110 (Francis Santos, confirmed Nov 24 2026): show/hide eye on password fields
   on the login screen and the invite / set-password screens. */
const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 4.5 20.5 22M9.6 9.8A3 3 0 0 0 14.2 14M7.2 7.4C5 8.8 3.4 11 2.5 12c0 0 3.5 6.5 9.5 6.5 1.8 0 3.4-.5 4.8-1.3M16.6 16.1C18.9 14.7 20.5 12.5 21.5 12c0 0-3.5-6.5-9.5-6.5-1.1 0-2.1.2-3.1.6"/></svg>';

function setVisible(input, btn, show) {
  input.type = show ? 'text' : 'password';
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  btn.setAttribute('aria-pressed', show ? 'true' : 'false');
  btn.innerHTML = show ? EYE_OFF : EYE;
}

/** Wrap each password input under root with a show/hide button. Safe to call more than once. */
export function enhancePasswordFields(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.closest('[data-password-field]')) return;
    const wrap = document.createElement('span');
    wrap.className = 'password-field';
    wrap.setAttribute('data-password-field', '');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'password-toggle';
    btn.setAttribute('data-password-toggle', '');
    setVisible(input, btn, false);
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    wrap.appendChild(btn);
    btn.addEventListener('click', () => { setVisible(input, btn, input.type === 'password'); });
  });
}
