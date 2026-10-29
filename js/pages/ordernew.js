// Place Order (Sales Processor only): creates a deal and links the chosen people (their intake tasks are copied from the current task templates).
import { html, $, guard, formData, options, toast } from '../ui.js';
import { TX_TYPES } from '../data/constants.js';

const PEOPLE = [['Client-Buyer', 'Buyer'], ['Client-Seller', 'Seller'], ['Buyer Agent', 'Buyer agent'], ['Listing Agent', 'Listing agent'], ['Transaction Coordinator', 'Transaction coordinator'], ['Sales Team', 'Sales team member']];

export async function render({ api, user, go }) {
  if (user.role !== 'Sales Processor') throw new Error('Only a Sales Processor can place orders.');
  const contacts = await api.listContacts(); const staff = await api.listSalesStaff();
  const pickers = PEOPLE.map(([role, label]) => html`<label>${label}<select name="p:${role}"><option value="">(none yet)</option>${options(contacts, '', (c) => `${c.firstName} ${c.lastName}${c.company ? ' \u2014 ' + c.company : ''}`, (c) => c.id)}</select></label>`);
  const body = html`
    <div class="box-title"><h2><span class="h-ico"></span>Place Order</h2></div>
    <form id="nof" class="card form-grid">
      <label class="span2">Street address *<input name="street" required maxlength="200"></label>
      <label>City *<input name="city" required maxlength="100"></label><label>State *<input name="state" required maxlength="2" value="MD" size="2"></label>
      <label>ZIP<input name="zip" maxlength="10" placeholder="20850"></label>
      <label>Transaction type<select name="transactionType">${options(TX_TYPES, 'Purchase')}</select></label>
      <label>Purchase price<input name="purchasePrice" inputmode="decimal" placeholder="485000"></label><label>Loan amount<input name="loanAmount" inputmode="decimal" placeholder="388000"></label>
      <label>Closing date<input name="closingDate" type="date"></label>
      <label>Sales person<select name="salesPersonId"><option value="">(none)</option>${options(staff, '', (s) => `${s.firstName} ${s.lastName}`, (s) => s.id)}</select></label>
      <h3 class="span2">People on this order <span class="muted">(you can add or change them later under Contacts)</span></h3>${pickers}
      <label class="span2">Notes<textarea name="notes" rows="3" maxlength="2000"></textarea></label>
      <div class="span2"><button class="m-btn" type="submit">Create order</button> <a class="ghost" href="#/orders">Cancel</a></div>
    </form>`;
  return { title: 'Place Order', crumbs: [['Orders', '#/orders'], ['Place Order']], body, mount(root) {
    $('#nof', root).addEventListener('submit', guard(async (e) => {
      e.preventDefault(); const f = formData(e.target); const input = { ...f };
      const deal = await api.createDeal(input);
      for (const [k, v] of Object.entries(f)) if (k.startsWith('p:') && v) await api.addParticipant(deal.id, v, k.slice(2));
      toast(`Order ${deal.fileNumber} created`); go('/deals/' + deal.id);
    }));
  } };
}
