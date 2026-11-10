/* Where this suite is allowed to run. TEST is one host. Local mock is loopback.
 * Anything else stops the process before a browser opens. */

export const TEST_HOST = 'testportal.clatitle.com';
export const TEST_ORIGIN = 'https://testportal.clatitle.com';
export const TEST_PROJECT_REF = 'aqcervntopidtcazcmlv';

export function targetMode() {
  return process.env.E2E_TARGET === 'test' ? 'test' : 'mock';
}

export function baseURL() {
  if (targetMode() === 'test') return (process.env.E2E_BASE_URL || TEST_ORIGIN).replace(/\/$/, '') + '/';
  return process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
}

export function assertSafeTarget() {
  const mode = targetMode();
  let url;
  try { url = new URL(baseURL()); } catch (e) {
    throw new Error('E2E_BASE_URL is not a URL. Refusing to start.');
  }
  const host = url.hostname.toLowerCase();
  if (mode === 'test') {
    if (url.protocol !== 'https:' || host !== TEST_HOST) {
      throw new Error(`Refusing to start. E2E_TARGET=test may open only https://${TEST_HOST}/.`);
    }
    return { mode, url: url.origin + '/' };
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('Refusing to start. Mock runs stay on 127.0.0.1 or localhost. Set E2E_TARGET=test only for the TEST portal.');
  }
  return { mode, url: url.origin + '/' };
}
