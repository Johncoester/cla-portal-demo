/* E-SIGNATURE PROVIDER SEAM (Matt, Oct 31, item 13). The portal never talks to a signing service directly: it asks a PROVIDER to
 * (1) open a request for a document and its signers, (2) record / receive a signature, (3) report status. The portal keeps its own
 * record (signature_requests + signers in SQL, signatureRequests in the mock) so the UI is the same whatever provider is used.
 *
 * DemoProvider = DEMO ONLY. Typing your name here is NOT a legally binding e-signature and nothing leaves the browser.
 * Real providers (DocuSign, Dropbox Sign) go server-side (Supabase Edge Function holding the API key, plus a webhook that marks the
 * signer signed). They implement the same three calls; swap with getProvider('docusign') once built. Nothing here is wired to them. */
const rand = () => Math.random().toString(36).slice(2, 10);
export const DemoProvider = {
  id: 'demo', label: 'Demo e-sign (NOT legally binding)', legallyBinding: false,
  async createRequest({ documentName, signers }) { return { envelopeId: `demo-${rand()}`, signers: signers.length, documentName }; },
  // the signer typed their name and ticked "adopt"; a real provider would return its own audit record
  async recordSignature({ envelopeId, signerId, typedName }) { return { certificate: `DEMO-${envelopeId}-${String(signerId).slice(-6)}-${rand()}`, typedName, at: new Date().toISOString() }; },
  async cancelRequest() { return true; },
};
const notBuilt = (id, label) => ({ id, label, legallyBinding: true, async createRequest() { throw new Error(`${label} is not connected in this build.`); },
  async recordSignature() { throw new Error(`${label} is not connected in this build.`); }, async cancelRequest() { throw new Error(`${label} is not connected in this build.`); } });
export const PROVIDERS = { demo: DemoProvider, docusign: notBuilt('docusign', 'DocuSign'), dropbox_sign: notBuilt('dropbox_sign', 'Dropbox Sign') };
export const ESIGN_PROVIDER = 'demo';   // the one in use
export const getProvider = (id = ESIGN_PROVIDER) => { const p = PROVIDERS[id]; if (!p) throw new Error('Unknown e-sign provider.'); return p; };
