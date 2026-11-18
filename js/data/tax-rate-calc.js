/* FF-091c: price a file from the tax rate sheet.
 * Order: figure the tax or fee, take off the exemptions, then split buyer and seller.
 * A blank rate is left blank. The screen says "Rate Not Set". The hardcoded calculator is the fallback when no sheet is loaded.
 */
export const RATE_NOT_SET = 'Rate Not Set';
const PAYERS = ['buyer', 'seller', 'split'];

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const usd = (n) => '$' + r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

function units(amt, unit) {
  if (!(amt > 0)) return 0;
  if (unit === 'percent') return amt / 100;
  if (unit === 'per100') return Math.ceil(amt / 100 - 1e-9);
  if (unit === 'per500') return Math.ceil(amt / 500 - 1e-9);
  if (unit === 'per1000') return Math.ceil(amt / 1000 - 1e-9);
  return 0;
}
function txOK(lineTx, type) {
  const t = lineTx || 'both';
  if (t === 'both' || t === 'all') return true;
  if (t === 'purchase') return type !== 'refi';
  if (t === 'refi') return type === 'refi';
  if (t === 'financed') return type !== 'cash';
  return false;
}
function lineKey(l) {
  if (l.kind === 'recording') return 'rec|' + l.document + '|' + l.name;
  return 'tax|' + l.name + '|' + l.transaction;
}
function overlay(base, extra, keyFn) {
  const keys = new Set(extra.map(keyFn));
  return base.filter((l) => !keys.has(keyFn(l))).concat(extra);
}
const active = (rows, id) => (rows || []).filter((r) => r && r.jurisdictionId === id && r.active !== false);

export function resolveSheet(bundle, place) {
  if (!bundle) return null;
  const state = String(place.state || '').toUpperCase();
  const county = String(place.county || '').trim();
  const city = String(place.city || '').trim();
  const js = (bundle.jurisdictions || []).filter((j) => j && j.active !== false && j.state === state);
  const stateJ = js.find((j) => !j.county && !j.city) || null;
  const countyJ = county ? js.find((j) => j.county === county && !j.city) || null : null;
  const cityJ = city ? js.find((j) => j.city === city && (!county || j.county === county || !j.county)) || null : null;
  if (!stateJ && !countyJ && !cityJ) return null;
  const parts = [stateJ, countyJ, cityJ].filter(Boolean);
  let lines = [];
  let allocations = [];
  let questions = [];
  for (const j of parts) {
    lines = overlay(lines, active(bundle.lines, j.id), lineKey);
    allocations = overlay(allocations, active(bundle.allocations, j.id), (a) => [a.taxName, a.document || '', a.transaction, a.whenKey || ''].join('|'));
    questions = overlay(questions, active(bundle.questions, j.id), (q) => q.key);
  }
  const ids = new Set(lines.map((l) => l.id));
  const exemptions = (bundle.exemptions || []).filter((e) => e && e.active !== false && ids.has(e.rateLineId));
  const where = cityJ || countyJ || stateJ;
  return { stateJ, countyJ, cityJ, lines, exemptions, allocations, questions, where };
}

export function questionsFor(bundle, place, type) {
  const sheet = resolveSheet(bundle, place);
  if (!sheet) return [];
  const tx = type === 'refi' ? 'refi' : 'purchase';
  return sheet.questions.filter((q) => q.transaction === 'both' || q.transaction === tx).sort((a, b) => (a.sort || 0) - (b.sort || 0));
}

function answerYes(answers, key) {
  const v = answers[key];
  return v === true || v === 'yes';
}
function livesThere(answers) {
  if (answers.ownerOccupied === false || answers.primaryResidence === false) return false;
  return answers.ownerOccupied === true || answers.primaryResidence !== false;
}

function exemptionsOn(line, sheet, answers, price) {
  let exempt = 0;
  let rate = line.rate;
  let fthb = false;
  const occ = answers.ownerOccupied === true;
  const buyerLives = livesThere(answers);
  const first = answerYes(answers, 'firstTimeBuyer') && buyerLives && (line.transaction !== 'refi');
  for (const ex of sheet.exemptions) {
    if (ex.rateLineId !== line.id) continue;
    if (ex.code === 'owner_occupied') {
      if (!occ || ex.amount == null) continue;
      exempt += ex.amount;
    } else if (ex.code === 'first_time_buyer') {
      if (!first) continue;
      if (ex.maxPrice != null && price > ex.maxPrice) continue;
      if (ex.amount != null) exempt += ex.amount;
      if (ex.alternateRate != null) rate = ex.alternateRate;
      fthb = ex.alternateRate != null || (ex.amount != null && ex.amount > 0);
    }
  }
  if (line.roundThird && rate != null) rate = Math.round(rate * 300) / 300;
  return { exempt, rate, fthb };
}

function sliceOf(line, base, exempt) {
  const from = Number(line.bracketFrom) || 0;
  const hi = line.bracketTo == null ? Infinity : Number(line.bracketTo);
  if (line.bracketMethod === 'marginal') {
    const taxable = Math.max(0, Math.min(hi, base) - Math.max(from, exempt));
    return { taxable, ok: true };
  }
  if (base < from - 1e-9 || base > hi + 1e-9) return { taxable: 0, ok: false };
  return { taxable: Math.max(0, base - exempt), ok: true };
}

function saleBase(input) {
  if (input.type === 'refi') return 0;
  const price = Number(input.price) || 0;
  if (input.state === 'VA' && input.type !== 'refi' && (Number(input.assessed) || 0) > price) return Number(input.assessed);
  return price;
}
function basisAmount(line, input) {
  if (line.basis === 'new_money') return input.type === 'refi' ? Math.max(0, (Number(input.loan) || 0) - (Number(input.payoff) || 0)) : 0;
  if (line.basis === 'loan') return input.type === 'cash' ? 0 : (Number(input.loan) || 0);
  return saleBase(input);
}

function halves(amt) {
  const c = Math.round((Number(amt) || 0) * 100);
  const b = Math.floor(c / 2);
  return [b / 100, (c - b) / 100];
}
function splitOf(payer, amt, refi) {
  const amount = r2(amt);
  if (!(amount > 0)) return { buyer: 0, seller: 0, paidBy: 'buyer' };
  if (refi || payer === 'buyer') return { buyer: amount, seller: 0, paidBy: 'buyer' };
  if (payer === 'seller') return { buyer: 0, seller: amount, paidBy: 'seller' };
  const [b, s] = halves(amount);
  return { buyer: b, seller: s, paidBy: 'split' };
}

function allocationFor(sheet, taxName, document, transaction, answers) {
  const rows = sheet.allocations.filter((a) => a.taxName === taxName && (a.document || '') === (document || '') && (a.transaction === transaction || a.transaction === 'both' || (a.transaction === 'purchase' && transaction !== 'refi')));
  const cond = rows.find((a) => a.whenKey && a.whenKey === 'first_time_buyer' && answerYes(answers, 'firstTimeBuyer') && livesThere(answers) && (a.whenValue || 'yes') === 'yes');
  const base = rows.find((a) => !a.whenKey);
  return cond || base || null;
}

function choosePayer(alloc, fallback, input, taxName) {
  const def = (alloc && alloc.paidBy) || fallback || 'buyer';
  const locked = !!(alloc && alloc.lawMandated);
  if (locked || input.type === 'refi') return { payer: input.type === 'refi' ? 'buyer' : def, def, locked };
  const per = input.payers && input.payers[taxName];
  const want = PAYERS.includes(per) ? per : (PAYERS.includes(input.answers.contractPayer) ? input.answers.contractPayer : '');
  return { payer: want || def, def, locked };
}

function recorder(state, county) {
  if (state === 'DC') return 'DC Recorder of Deeds';
  const name = String(county || '').trim();
  const place = /\bcity$/i.test(name) || /^district of columbia$/i.test(name) ? name : (name ? name + ' County' : state);
  return `Clerk of the Circuit Court, ${place}`;
}
function presetsFor(state, key) {
  if (key === 'rec:Deed') return ['recordingDeed'];
  if (key === 'rec:Deed of Trust') return ['recordingMortgage'];
  if (key === 'lien') return ['md-lienCert'];
  if (!key.startsWith('tax:')) return [];
  const n = key.slice(4).toLowerCase();
  if (state === 'MD') return /state transfer/.test(n) ? ['md-stateTransfer'] : /county transfer/.test(n) ? ['md-countyTransfer'] : /recordation/.test(n) ? ['md-recordation'] : [];
  if (state === 'VA') return /grantor/.test(n) ? ['va-grantor'] : /^state .*recordation/.test(n) ? ['va-stateRecordation'] : /^local .*recordation/.test(n) ? ['va-localRecordation'] : [];
  if (state === 'DC') return /recordation/.test(n) ? ['dc-recordation'] : /transfer/.test(n) ? ['dc-transfer'] : [];
  if (state === 'FL') return /stamps on deed/.test(n) ? ['fl-docStampsDeed'] : /stamps on note/.test(n) ? ['fl-docStampsNote'] : /intangible/.test(n) ? ['fl-intangible'] : [];
  return [];
}

function feeLine(key, description, amount, payer, refi, meta) {
  const sp = splitOf(payer, amount, refi);
  return {
    key, description, altaSection: 'government', cdSection: 'E', cdLine: '', payee: meta.payee, amount: r2(amount),
    paidBy: sp.paidBy, split: { buyer: sp.buyer, seller: sp.seller, lender: 0, other: 0 },
    titlePrefix: false, timing: 'at', poc: false, rateSource: meta.rateSource, calculation: meta.calculation,
    replacesPresets: presetsFor(meta.state, key), lawMandated: !!meta.lawMandated, defaultPayer: meta.def || payer
  };
}

function howText(line, rate, taxable) {
  const rt = +Number(rate).toFixed(6);
  const unit = line.rateUnit;
  if (unit === 'percent') return `${rt}% × ${usd0(taxable)}`;
  if (unit === 'per100') return `$${rt} per $100 × ${Math.ceil(taxable / 100 - 1e-9).toLocaleString('en-US')}`;
  if (unit === 'per500') return `$${rt} per $500 × ${Math.ceil(taxable / 500 - 1e-9).toLocaleString('en-US')}`;
  if (unit === 'per1000') return `$${rt} per $1,000 × ${Math.ceil(taxable / 1000 - 1e-9).toLocaleString('en-US')}`;
  return `${rt} ${unit}`;
}

function taxLinesFor(sheet, input, rows) {
  const out = [];
  const pending = [];
  const warnings = [];
  const groups = new Map();
  for (const line of rows) {
    if (line.rate == null) {
      const g = groups.get(line.name) || { name: line.name, pending: true, bits: [], amt: 0, fthb: false, line };
      g.pending = true;
      groups.set(line.name, g);
      continue;
    }
    const base = basisAmount(line, input);
    if (!(base > 0)) continue;
    const ex = exemptionsOn(line, sheet, input.answers, Number(input.price) || 0);
    const slice = sliceOf(line, base, ex.exempt);
    if (!slice.ok) continue;
    const amt = r2(units(slice.taxable, line.rateUnit) * (ex.rate || 0));
    const g = groups.get(line.name) || { name: line.name, pending: false, bits: [], amt: 0, fthb: false, line, exempt: 0, base };
    if (g.pending) { groups.set(line.name, g); continue; }
    g.amt = r2(g.amt + amt);
    g.fthb = g.fthb || ex.fthb;
    g.exempt = Math.max(g.exempt || 0, ex.exempt);
    g.base = base;
    if (amt > 0 || rows.filter((r) => r.name === line.name).length === 1) {
      const basisName = line.basis === 'new_money' ? 'new money (loan minus payoff)' : line.basis === 'loan' ? 'loan amount' : (input.state === 'VA' && saleBase(input) !== input.price ? 'assessed value' : 'price');
      g.bits.push(`${howText(line, ex.rate, slice.taxable)} = ${usd(amt)} (${basisName} ${usd0(base)}${ex.exempt ? `, less ${usd0(ex.exempt)} exemption` : ''}${ex.fthb ? ', first-time buyer' : ''})`);
    }
    groups.set(line.name, g);
  }
  for (const g of groups.values()) {
    const alloc = allocationFor(sheet, g.name, '', g.line.transaction, input.answers);
    const choice = choosePayer(alloc, g.line.paidBy, input, g.name);
    if (g.pending) {
      const manual = input.manual && input.manual['tax:' + g.name];
      if (manual == null || manual === '') {
        pending.push({ key: 'tax:' + g.name, name: g.name, payee: recorder(input.state, input.county), lawMandated: choice.locked, defaultPayer: choice.def });
        continue;
      }
      g.amt = r2(manual);
      g.bits = [`Rate was not set. Staff entered ${usd(g.amt)}.`];
    }
    if (!(g.amt > 0)) {
      warnings.push(`${g.name}: $0.00 on this file (an exemption or the rate table brings it to zero), so no line is added. Check the answers above if you expected a charge.`);
      continue;
    }
    const refi = input.type === 'refi';
    let tag = '';
    if (choice.locked && g.fthb) tag = ' (first-time buyer: buyer exempt, seller pays)';
    else if (choice.payer === 'split' && !refi) tag = ' (split 50/50)';
    else if (choice.payer !== choice.def && choice.payer === 'buyer') tag = ' (paid by buyer)';
    else if (choice.payer !== choice.def && choice.payer === 'seller') tag = ' (paid by seller)';
    const onAssessed = input.state === 'VA' && saleBase(input) !== input.price && g.line.basis === 'sale';
    const label = g.name + (g.fthb && !choice.locked ? ' (first-time buyer)' : '') + (onAssessed ? ' (on assessed value)' : '') + tag;
    const who = choice.locked ? 'seller, fixed by law' : (choice.payer === 'split' ? 'split 50/50' : choice.payer);
    const calc = `${g.name}: ${g.bits.join(' + ')}. Figured first, exemptions already taken off, then ${who}.`;
    out.push(feeLine('tax:' + g.name, label, g.amt, choice.payer, refi, {
      payee: recorder(input.state, input.county), rateSource: `Tax rate sheet · ${input.state} ${input.county || 'statewide'} · ${g.name}`,
      calculation: calc, state: input.state, lawMandated: choice.locked, def: choice.def
    }));
  }
  return { lines: out, pending, warnings };
}

/* Maryland: the part of the loan above the price. Same rule as the calculator (Tax-Property 12-108(i)). The buyer pays unless the contract moves it. */
function loanAbove(sheet, input, rows) {
  if (input.state !== 'MD' || input.type !== 'purchase' || !(input.loan > input.price) || !(input.price > 0)) return [];
  const above = input.loan - input.price;
  const groups = new Map();
  for (const line of rows) {
    if (line.basis !== 'sale' || line.rate == null) continue;
    const county = String(input.county || '');
    if (!(/recordation/i.test(line.name) || (/^prince george/i.test(county) && /county transfer/i.test(line.name)))) continue;
    const from = Number(line.bracketFrom) || 0;
    const hi = line.bracketTo == null ? Infinity : Number(line.bracketTo);
    let taxable = 0;
    if (line.bracketMethod === 'marginal') taxable = Math.max(0, Math.min(hi, input.loan) - Math.max(from, input.price));
    else {
      if (input.price < from - 1e-9 || input.price > hi + 1e-9) continue;
      taxable = above;
    }
    const amt = r2(units(taxable, line.rateUnit) * line.rate);
    if (!(amt > 0)) continue;
    const name = line.name + ' on loan above price';
    const g = groups.get(name) || { name, amt: 0 };
    g.amt = r2(g.amt + amt);
    groups.set(name, g);
  }
  return [...groups.values()].map((g) => {
    const want = input.payers && input.payers[g.name];
    const payer = PAYERS.includes(want) ? want : (PAYERS.includes(input.answers.contractPayer) ? input.answers.contractPayer : 'buyer');
    return feeLine('tax:' + g.name, g.name, g.amt, payer, false, {
      payee: recorder(input.state, input.county), state: input.state, lawMandated: false, def: 'buyer',
      rateSource: `Tax rate sheet · ${input.state} ${input.county} · ${g.name}`,
      calculation: `${g.name}: loan ${usd0(input.loan)} − price ${usd0(input.price)} = ${usd0(above)}. Figured on the part of the loan above the price, then assigned. The rate sheet starts with the buyer.`
    });
  });
}

function recordingLines(sheet, input) {
  const lines = [];
  const pending = [];
  const refi = input.type === 'refi';
  for (const doc of input.documents || []) {
    if (!(doc.pages > 0)) continue;
    const pool = sheet.lines.filter((l) => l.kind === 'recording' && l.document === doc.type && txOK(l.transaction, input.type));
    const tierOK = (l) => (l.pageTierFrom == null || doc.pages >= l.pageTierFrom) && (l.pageTierTo == null || doc.pages <= l.pageTierTo);
    const whenOK = (l) => {
      if (!l.whenKey) return true;
      if (l.whenKey === 'primary_residence') {
        const yes = doc.occ === false ? 'no' : 'yes';
        return yes === (l.whenValue || 'yes');
      }
      return false;
    };
    let parts = pool.filter((l) => tierOK(l) && whenOK(l));
    const replacing = parts.filter((l) => l.replacesName);
    if (replacing.length) {
      const names = new Set(replacing.map((l) => l.replacesName));
      parts = parts.filter((l) => !names.has(l.name));
    }
    const lien = parts.filter((l) => /lien certificate/i.test(l.name));
    const rec = parts.filter((l) => !/lien certificate/i.test(l.name));
    const sum = (list) => {
      if (list.some((l) => l.flatFee == null && l.rate == null)) return { pending: true, amt: 0 };
      let amt = 0;
      for (const l of list) {
        const add = l.pagesIncluded != null ? Math.max(0, doc.pages - l.pagesIncluded) * (Number(l.perAdditionalPage) || 0) : 0;
        amt += (Number(l.flatFee) || 0) + add;
      }
      return { pending: false, amt: r2(amt) };
    };
    const big = replacing.length > 0;
    if (rec.length) {
      const total = sum(rec);
      const key = 'rec:' + doc.type;
      if (total.pending) pending.push({ key, name: 'Recording fees – ' + doc.type, payee: recorder(input.state, input.county) });
      else if (total.amt > 0) {
        const label = `Recording fees – ${doc.type}${big ? ' (not a principal residence)' : ''}`;
        lines.push(feeLine(key, label, total.amt, rec[0].paidBy, refi, {
          payee: recorder(input.state, input.county), state: input.state, lawMandated: false, def: rec[0].paidBy,
          rateSource: `Tax rate sheet · Recording fees · ${input.state} · ${doc.type}`,
          calculation: `${doc.type}: ${doc.pages} page${doc.pages === 1 ? '' : 's'} = ${usd(total.amt)}${big ? '. Not a principal residence, so the higher Maryland fee applies.' : ''}.`
        }));
      }
    }
    for (const l of lien) {
      if (l.flatFee == null) { pending.push({ key: 'lien', name: 'Lien certificate', payee: recorder(input.state, input.county) }); continue; }
      if (!(l.flatFee > 0)) continue;
      const place = /\bcity$/i.test(input.county) || /^district of columbia$/i.test(input.county) ? input.county : input.county + ' County';
      lines.push(feeLine('lien', `Lien certificate – ${place}`, l.flatFee, l.paidBy, refi, {
        payee: place + ' Treasurer', state: input.state, lawMandated: false, def: l.paidBy,
        rateSource: `Tax rate sheet · ${input.state} ${input.county} · lien certificate`,
        calculation: `${l.name}: flat ${usd(l.flatFee)}.`
      }));
    }
  }
  return { lines, pending };
}

function applicableTaxes(sheet, input) {
  let rows = sheet.lines.filter((l) => l.kind === 'tax' && txOK(l.transaction, input.type));
  if (input.type === 'refi' && !(Number(input.payoff) > 0) && input.state === 'VA') {
    const onLoan = (l) => l.basis === 'loan';
    const refiLoan = rows.filter((l) => onLoan(l) && l.transaction === 'refi');
    if (refiLoan.length) {
      const purchaseLoan = sheet.lines.filter((l) => l.kind === 'tax' && l.transaction === 'purchase' && onLoan(l));
      rows = rows.filter((l) => !refiLoan.includes(l)).concat(purchaseLoan);
    }
  }
  return rows;
}

export function payerProblem(input) {
  const payers = input && input.payers;
  if (!payers) return '';
  for (const [name, want] of Object.entries(payers)) {
    if (want && !PAYERS.includes(want)) return `Choose Buyer pays, Seller pays, or 50/50 split for ${name}.`;
  }
  if (input.answers && input.answers.contractPayer && !PAYERS.includes(input.answers.contractPayer)) return 'Choose Buyer pays, Seller pays, or 50/50 split for who pays under the contract.';
  return '';
}

/* Returns null when this state has no sheet, so the caller keeps the hardcoded calculator. */
export function calculateRateSheet(bundle, input) {
  const sheet = resolveSheet(bundle, input);
  if (!sheet) return null;
  const bad = payerProblem(input);
  if (bad) { const err = new Error(bad); err.field = 'payer'; throw err; }
  const warnings = [];
  const answers = input.answers || {};
  if (answerYes(answers, 'firstTimeBuyer') && !livesThere(answers) && input.type !== 'refi') {
    warnings.push('First-time homebuyer programs need an owner-occupied principal residence: the first-time buyer treatment is not applied.');
  }
  if (answerYes(answers, 'otherExemption')) warnings.push('Other statutory exemption: no amount is set on this rate sheet, so the tax was not reduced. An Admin can set it under Tax rates.');
  if (answerYes(answers, 'mortgageConcurrent')) warnings.push('Recording the mortgage with the deed: no separate rate is set, so the fee did not change.');
  if (input.type === 'refi' && input.state === 'MD' && Number(input.payoff) > 0) {
    warnings.push('Maryland refinance: recordation tax is figured on the new money only. That assumes the borrower signs the original mortgagor affidavit (Tax-Property 12-108(g)). If not, recordation tax is due on the whole loan.');
  }
  const taxes = applicableTaxes(sheet, input);
  const taxed = taxLinesFor(sheet, input, taxes);
  const above = loanAbove(sheet, input, taxes);
  const rec = recordingLines(sheet, input);
  const pending = [...rec.pending, ...taxed.pending];
  for (const p of pending) {
    const manual = input.manual && input.manual[p.key];
    if (manual == null || manual === '') warnings.push(`${p.name}: ${RATE_NOT_SET}. Enter the fee, or ask an Admin to set the rate.`);
  }
  let lines = [...rec.lines, ...taxed.lines, ...above];
  const manualLines = [];
  for (const p of pending) {
    const manual = input.manual && input.manual[p.key];
    if (manual == null || manual === '' || !(r2(manual) > 0)) continue;
    manualLines.push(feeLine(p.key, p.name, r2(manual), p.defaultPayer || 'buyer', input.type === 'refi', {
      payee: p.payee, state: input.state, lawMandated: !!p.lawMandated, def: p.defaultPayer,
      rateSource: 'Tax rate sheet · rate not set · entered by staff',
      calculation: `${p.name}: ${RATE_NOT_SET}. Staff entered ${usd(manual)}. Then split from the rate sheet.`
    }));
  }
  lines = lines.concat(manualLines);
  let n = 0;
  for (const l of lines) l.cdLine = String(++n).padStart(2, '0');
  const open = pending.filter((p) => !(input.manual && input.manual[p.key] != null && input.manual[p.key] !== '' && r2(input.manual[p.key]) > 0));
  return {
    lines, pending: open, warnings: [...warnings, ...taxed.warnings],
    where: sheet.where, questions: sheet.questions, used: true
  };
}

export function rateNotSetMessage(result) {
  const open = result && result.pending && result.pending[0];
  if (!open) return '';
  return `Enter an amount for ${open.name}. The rate is not set. Nothing was saved.`;
}
