/* MF-087 (Matt, Nov 27): buyer/seller Start a conversation defaults To the file Processor, with no picker. */
import { readFileSync } from 'node:fs';
import { startConversationTo } from '../js/pages/dealmsgs.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const src = readFileSync(new URL('../js/pages/dealmsgs.js', import.meta.url), 'utf8');

const buyer = startConversationTo({ myRole: 'Client-Buyer', processorId: 'u-proc', processorName: 'Pat Processor' });
ok(buyer.mode === 'processor' && buyer.id === 'u-proc' && buyer.name === 'Pat Processor' && !buyer.missing, 'a buyer is addressed to the file Processor by name');

const seller = startConversationTo({ myRole: 'Client-Seller', processorId: 'u-proc', processorName: 'Pat Processor' });
ok(seller.mode === 'processor' && seller.id === 'u-proc', 'a seller is also addressed to the file Processor');

const missing = startConversationTo({ myRole: 'Client-Buyer', processorId: '', processorName: '' });
ok(missing.mode === 'processor' && missing.missing && missing.name === 'Processor', 'a buyer on a file with no Processor is told the conversation cannot start');

const agent = startConversationTo({ myRole: 'Buyer Agent', processorId: 'u-proc', processorName: 'Pat Processor' });
ok(agent.mode === 'picker', 'an agent still gets the To picker');

const staff = startConversationTo({ myRole: 'Processor', processorId: 'u-proc', processorName: 'Pat Processor' });
ok(staff.mode === 'picker', 'CLA staff still get the To picker');

ok(src.includes('data-conversation-to-processor') && src.includes('data-to-processor-name') && src.includes('data-no-processor'), 'the modal shows a read-only To with the Processor name');
ok(src.includes("participantIds: [toField.id]"), 'the buyer/seller send path uses only the Processor id');
ok(src.includes("toField.mode === 'processor'") && src.includes("toField.mode === 'picker'"), 'the Processor To and the existing picker are separate paths');
ok(src.includes('name="to"') && src.includes("toField.mode === 'picker'"), 'checkboxes stay on the staff and agent picker only');

console.log(fail ? `mf-087: ${fail} failed` : 'mf-087: passed');
if (fail) process.exit(1);
