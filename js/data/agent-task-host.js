/* Hosted agent tasks use the existing get_agent_task and submit_agent_task functions.
 * A permission error is returned as the database said it. */

export async function readHostedAgentTask(sb, id) {
  const res = await sb.rpc('get_agent_task', { p_task: id });
  if (res.error) throw new Error(res.error.message);
  return res.data || {};
}

export async function submitHostedAgentTask(sb, id, answers) {
  const res = await sb.rpc('submit_agent_task', { p_task: id, p_answers: answers });
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function hostedAgentTaskView(row, task) {
  const hidden = !!(row && row.answersHidden);
  const status = (row && row.status) || (task && task.status) || '';
  return {
    ...(task || {}),
    id: (row && row.id) || (task && task.id),
    title: (row && row.title) || (task && task.title) || '',
    status,
    code: (task && task.templateCode) || '',
    answersHidden: hidden,
    answers: hidden ? null : ((row && row.answers) || {}),
    revisions: (row && row.revisions) || [],
    submitted: status === 'done',
  };
}
