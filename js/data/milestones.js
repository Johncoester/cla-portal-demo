/* MF-068 (Matt Landsberg, Portal Feedback Nov 25 2026): Order Status milestones can be
 * checked off on their own, in any order. deals.stage is the highest completed index (or 0 if none). */
export const MILESTONE_COUNT = 10;

export function emptyMilestones() {
  return Array.from({ length: MILESTONE_COUNT }, () => false);
}

/** Backfill used for files that already have a linear stage and no saved set. Inclusive of the current step. */
export function milestonesFromStage(stage) {
  const n = Number(stage);
  const cur = Number.isInteger(n) ? Math.max(0, Math.min(MILESTONE_COUNT - 1, n)) : 0;
  return Array.from({ length: MILESTONE_COUNT }, (_, i) => i <= cur);
}

export function parseMilestones(raw, stage) {
  if (Array.isArray(raw) && raw.length === MILESTONE_COUNT) return raw.map((v) => !!v);
  return milestonesFromStage(stage);
}

export function derivedStage(done) {
  const list = Array.isArray(done) ? done : [];
  let max = -1;
  for (let i = 0; i < list.length; i += 1) if (list[i]) max = i;
  return max < 0 ? 0 : max;
}

export function toggleMilestone(done, index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= MILESTONE_COUNT) throw new Error('Unknown stage.');
  const next = parseMilestones(done, derivedStage(done)).slice();
  next[i] = !next[i];
  return next;
}

export function milestonesDoneCount(done) {
  return (Array.isArray(done) ? done : []).filter(Boolean).length;
}
