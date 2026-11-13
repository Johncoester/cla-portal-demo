// FF-073b (Janine's buyer recordings, Nov 12; Francis Feedback ticket): the Forgot password email linked to the old GitHub
// Pages address. The reset link now opens the portal the person is using. The old GitHub address and anything that is not
// a normal https page (a file:// preview, a bare IP) fall back to the TEST portal.
export const TEST_PORTAL = 'https://testportal.clatitle.com/';
export function resetRedirect(loc = globalThis.location) {
  try {
    if (!loc || loc.protocol !== 'https:' || !loc.hostname || loc.hostname === 'johncoester.github.io' || /^[\d.]+$/.test(loc.hostname)) return TEST_PORTAL;
    const path = String(loc.pathname || '/').replace(/index\.html$/, '');
    return loc.origin + (path.endsWith('/') ? path : path + '/');
  } catch (e) { return TEST_PORTAL; }
}
