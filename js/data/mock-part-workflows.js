/* Mock workflows. Definitions only: saving one does not add tasks to a file. */
import { canReadWorkflows, commitWorkflow, matchWorkflow, presentWorkflows } from './workflows.js?v=202611061447';

export function workflowsPart(x) {
  const { load, save, needUser, fail, log } = x;
  const read = () => { const u = needUser(); if (!canReadWorkflows(u)) fail('Workflows are for CLA staff.'); return u; };
  return {
    async listWorkflows() { read(); return presentWorkflows(load()); },
    async saveWorkflow(input = {}) {
      const u = needUser();
      const d = load();
      const id = commitWorkflow(d, u, input);
      if (!Array.isArray(d.activity)) d.activity = [];
      log(null, u.id, 'workflow.saved', 'workflow', id, (d.workflows.find((w) => w.id === id) || {}).name || '');
      save();
      return presentWorkflows(d).find((w) => w.id === id);
    },
    async previewWorkflowMatch(query = {}) {
      read();
      return matchWorkflow(presentWorkflows(load()), query);
    },
  };
}
