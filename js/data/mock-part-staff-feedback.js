/* Mock adapter for staff portal feedback. Fake people only. Nothing is sent to the assistant.
 * The test simulation is labeled and is not a real reply. */
import { addAttachment, addContextFile, attachmentContent, canReportStaffFeedback, createReport, emptyBag, getReport, listReports, publishDraft, replyToReport, reviewStaffReply, setReportStatus, simulateReport } from './staff-feedback.js?v=202611072230';

export function staffFeedbackPart(x) {
  const bag = () => { const d = x.load(); d.staffFeedback ||= emptyBag(); return d.staffFeedback; };
  const actor = () => {
    const u = x.me();
    if (!u) x.fail('Please sign in.');
    return { id: u.id, role: u.role, isAdmin: !!u.isAdmin, status: u.status || 'active', isDemo: !!u.isDemo, demoViewActive: !!u.demoViewActive, firstName: u.firstName, lastName: u.lastName };
  };
  const findOrder = (who, fileNumber) => {
    const typed = String(fileNumber || '').trim();
    const hit = x.dealsFor(who).find((d) => d.fileNumber === typed && !!d.isDemo === !!who.isDemo);
    return hit ? { id: hit.id, fileNumber: hit.fileNumber } : null;
  };
  const run = (fn) => { const out = fn(); x.save(); return x.clone(out); };
  return {
    async listStaffFeedback() { return x.clone(listReports(bag(), actor())); },
    async getStaffFeedback(id) { return x.clone(getReport(bag(), actor(), id)); },
    async createStaffFeedback(input) { return run(() => createReport(bag(), actor(), input, { now: x.now, id: x.nid, findOrder })); },
    async replyStaffFeedback(id, input) { return run(() => replyToReport(bag(), actor(), id, input, { now: x.now, id: x.nid })); },
    async setStaffFeedbackStatus(id, status) { return run(() => setReportStatus(bag(), actor(), id, status, { now: x.now })); },
    async addStaffFeedbackAttachment(id, file) { return run(() => addAttachment(bag(), actor(), id, file, { now: x.now, id: x.nid })); },
    async addStaffFeedbackContextFile(id, file) { return run(() => addContextFile(bag(), actor(), id, file, { now: x.now, id: x.nid })); },
    async openStaffFeedbackAttachment(id) { return x.clone(attachmentContent(bag(), actor(), id)); },
    async publishStaffFeedbackDraft(id) { return run(() => publishDraft(bag(), actor(), id, { now: x.now })); },
    async reviewStaffFeedbackReply(id) { return run(() => reviewStaffReply(bag(), actor(), id, { now: x.now })); },
    async simulateStaffFeedback(id) { return run(() => simulateReport(bag(), actor(), id, { now: x.now, id: x.nid })); },
    async requestStaffFeedbackDispatch() { return { sent: false, replied: false, runAccepted: false, recorded: false, reason: 'bridge_unconfigured', error: 'Dispatch is not enabled. Nothing was sent.', exactlyOnce: false }; },
    staffFeedbackAllowed: canReportStaffFeedback,
  };
}
