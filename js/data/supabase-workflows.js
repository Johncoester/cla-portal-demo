/* Workflows on Supabase. Same shapes as the mock adapter. save_workflow is the only write.
 * The migration is not applied until John says so. list/save will fail on TEST until then. */
import { canEditWorkflows, canReadWorkflows, matchWorkflow } from './workflows.js?v=202611061918';

const EDIT_MSG = 'Only an Admin or Super admin can edit workflows.';
const READ_MSG = 'Workflows are for CLA staff.';

export function workflowsSupabase({ sb, ok, camel, me }) {
  const gate = async (edit) => {
    const u = await me();
    if (edit ? !canEditWorkflows(u) : !canReadWorkflows(u)) throw new Error(edit ? EDIT_MSG : READ_MSG);
    return u;
  };
  const list = async () => {
    const wfs = camel(ok(await sb.from('workflows').select('id, name, description, active, audience, updated_at').order('name'))) || [];
    const steps = camel(ok(await sb.from('workflow_steps').select('id, workflow_id, task_template_id, position, depends_on, template:task_templates(code, title, version)').order('position'))) || [];
    const asg = camel(ok(await sb.from('workflow_assignments').select('id, workflow_id, role, file_type, state'))) || [];
    return wfs.map((w) => ({
      id: w.id, name: w.name, description: w.description || '', active: w.active !== false, audience: w.audience, updatedAt: w.updatedAt || null,
      steps: steps.filter((s) => s.workflowId === w.id).sort((a, b) => a.position - b.position).map((s) => ({
        id: s.id, taskTemplateId: s.taskTemplateId, position: s.position, dependsOn: s.dependsOn || null,
        templateCode: (s.template && s.template.code) || '', templateTitle: (s.template && s.template.title) || '', templateVersion: s.template ? s.template.version : null,
      })),
      assignments: asg.filter((a) => a.workflowId === w.id).map((a) => ({ id: a.id, role: a.role || '', fileType: a.fileType || '', state: a.state || '' })),
    }));
  };
  return {
    async listWorkflows() { await gate(false); return list(); },
    async saveWorkflow(input = {}) {
      await gate(true);
      const id = ok(await sb.rpc('save_workflow', {
        p_id: input.id || null,
        p_name: input.name,
        p_description: input.description || '',
        p_active: input.active !== false && input.active !== 'false',
        p_audience: input.audience,
        p_steps: (input.steps || []).map((s) => ({ key: s.id || s.key, task_template_id: s.taskTemplateId, position: s.position, depends_on: s.dependsOn || null })),
        p_assignments: (input.assignments || []).map((a) => ({ role: a.role || '', file_type: a.fileType || '', state: a.state || '' })),
      }));
      const rows = await list();
      return rows.find((w) => w.id === id) || { id };
    },
    async previewWorkflowMatch(query = {}) {
      const rows = await this.listWorkflows();
      return matchWorkflow(rows, query);
    },
  };
}
