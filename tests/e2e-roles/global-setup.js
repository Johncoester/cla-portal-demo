import { reopenSeedClientTasks } from './helpers/seed-tasks.js';
import { targetMode } from './helpers/gate.js';

/* Runs once before the walkthrough. On TEST it puts the E2E buyer's and E2E seller's finished form tasks on the seeded
 * file back to To do, so no test depends on what an earlier run left behind (John, Nov 13). Mock runs start fresh. */
export default async function globalSetup() {
  if (targetMode() !== 'test') return;
  const n = await reopenSeedClientTasks();
  console.log(`Seeded test file: reopened ${n.buyer} buyer and ${n.seller} seller task(s) left Done by earlier runs.`);
}
