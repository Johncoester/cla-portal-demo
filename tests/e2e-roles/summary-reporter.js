import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default class SummaryReporter {
  constructor() { this.rows = []; }
  onTestEnd(test, result) {
    const title = test.titlePath().filter(Boolean).join(' > ');
    const expectedFail = test.expectedStatus === 'failed';
    let status = result.status;
    if (expectedFail && result.status === 'failed') status = 'expected-fail';
    if (expectedFail && result.status === 'passed') status = 'unexpected-pass';
    const ticket = (test.annotations.find((a) => a.type === 'fail') || {}).description || '';
    this.rows.push({ title, status, ticket, ms: result.duration });
  }
  onEnd() {
    const counts = {};
    for (const row of this.rows) counts[row.status] = (counts[row.status] || 0) + 1;
    const lines = [
      '# E2E role smoke summary',
      '',
      Object.entries(counts).map(([k, n]) => `- ${k}: ${n}`).join('\n') || '- no tests',
      '',
      '| Result | Test | Ticket |',
      '| --- | --- | --- |',
      ...this.rows.map((r) => `| ${r.status} | ${r.title.replace(/\|/g, '/')} | ${r.ticket || ''} |`),
      '',
    ];
    const text = lines.join('\n');
    fs.mkdirSync(path.join(dir, 'test-results'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'test-results', 'summary.md'), text);
    console.log(`\n${text}`);
  }
}
