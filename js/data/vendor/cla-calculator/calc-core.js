/* VENDORED from cla-calculator (github.com/Johncoester/cla-closing-cost-calculator) at commit 69568a9: index.html, first <script> block up to the UI section (pure calculation code).
 * READ-ONLY SOURCE: do not edit here. Copied by tools/vendor-cla-calculator.js on 2026-11-04; refresh by re-running it
 * with a newer calculator commit (see docs/CALCULATOR-FEES.md). Only the ES-module wrapper (this header, the import and the export line) is added.
 * sha256 of the copied text: aa835376786dcba5c03ade3e13ad6e07e96a41593d83fa617e5c42ef5390c93b */
import { CLA_FEES_SNAPSHOT } from './fee-snapshot.js?v=202611032132';
// ---- verbatim from cla-calculator index.html ----
// ---------- config ----------
const SHEET_ID="1kVBo3hchS-B5-g8NHn5ZSAdAZxXxOjuaHTv6SuXamOM"; // "CLA Fee Tables (Live - Calculator)" (anyone-with-link viewer)
const TABS=["CLA_Fees","Recording_Fees","Transfer_Taxes","Premium_Tiers","Premium_Rules","Endorsements","Jurisdictions"];
const REQUIRED=["CLA_Fees","Recording_Fees","Transfer_Taxes","Premium_Tiers","Premium_Rules","Endorsements"];
const sheetCsvUrl=tab=>`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;
// [count, pages] — page counts match CLA's Lodestar quote defaults (deed 3 pages, mortgage/DOT 30 pages; release only on refis)
const DOC_DEFAULTS={purchase:{"Deed":[1,3],"Deed of Trust":[1,30],"Release":[0,3],"Power of Attorney":[0,3]},
cash:{"Deed":[1,3],"Deed of Trust":[0,30],"Release":[0,3],"Power of Attorney":[0,3]},
refi:{"Deed":[0,3],"Deed of Trust":[1,30],"Release":[1,3],"Power of Attorney":[0,3]}};
const LIEN_CERT=/lien certificate/i,lienPlace=c=>{c=String(c||"").trim();return/\bcity$|^district of columbia$/i.test(c)?c:c+" County"};
// note shown under Section E (and the seller's government fees card) whenever a recording fee line is listed (Melissa Gamble 11/02)
const hasRec=rows=>(rows||[]).some(l=>/^Recording fees/.test(l.item));
const REC_NOTE="Recording fees may change depending on the number of pages.";
// Maryland (RP 3-601): $115 (incl. $40 surcharge) for an instrument that is not solely a principal residence. Melissa Gamble 11/02/26: CLA defaults
// the DEED OF TRUST to $115 whenever the property is not a principal residence (any page count; a deed of trust is normally 10+ pages), and the deed
// stays $60 ("deed over $60 is rare"). Before 11/02 both documents went to $115 only at 10+ pages (default deed 3 pages, so only the deed of trust moved).
const MD_BIG_INSTR={"Deed of Trust":115};
const SEC={B:"B. Services you cannot shop for",C:"C. Services you can shop for",E:"E. Taxes and other government fees",H:"H. Other"};

// ---------- parsing ----------
function parseCSV(t){const rows=[];let row=[],f="",q=false;t=String(t).replace(/^\uFEFF/,"");for(let i=0;i<t.length;i++){const c=t[i];
 if(q){if(c=='"'){if(t[i+1]=='"'){f+='"';i++}else q=false}else f+=c}
 else if(c=='"')q=true;else if(c==","){row.push(f);f=""}else if(c=="\n"||c=="\r"){if(c=="\r"&&t[i+1]=="\n")i++;row.push(f);rows.push(row);row=[];f=""}else f+=c}
 if(f!==""||row.length){row.push(f);rows.push(row)}return rows.filter(r=>r.some(c=>String(c).trim()!==""))}
const eq=(a,b)=>String(a??"").trim().toLowerCase()===String(b??"").trim().toLowerCase();
const num=v=>{if(v===null||v===undefined)return null;const s=String(v).replace(/[$,%\s]/g,"");if(s==="")return null;const n=+s;return isNaN(n)?null:n};
function toRows(sheet){if(!sheet||!sheet.length)return[];const[h,...r]=sheet;const H=h.map(x=>String(x).trim());
 return r.map(a=>Object.fromEntries(H.map((k,i)=>[k,a[i]??""]))).filter(o=>"Active"in o?String(o.Active).trim().toUpperCase()==="Y":true)}
function normalize(raw){const o={};for(const k of TABS)o[k]=raw&&raw[k]?toRows(raw[k]):[];return o}
function validTab(rows){return Array.isArray(rows)&&rows.length>0&&rows[0].map(x=>String(x).trim()).includes("Active")}

// ---------- matching helpers ----------
const isAll=c=>{c=String(c??"").trim();return c===""||c==="*"||eq(c,"All")};
const inCounty=(row,co)=>{const c=row["County/City"];return isAll(c)||String(c).split(",").some(x=>eq(x,co))};
const txOK=(t,type)=>{t=String(t||"Both").trim().toLowerCase();if(t==="both"||t==="all")return true;if(t==="purchase")return type!=="refi";if(t.startsWith("refi"))return type==="refi";if(t==="financed")return type!=="cash";return false};
// lender-only CLA fees (never on a cash purchase): Transaction "Financed" or a fee name marked "(Lender)"
const lenderOnly=f=>eq(f.tx??f.Transaction,"Financed")||/\(lender\)/i.test(f.name??f["Fee Name"]??"");
const perDoc=f=>/e-?recording/i.test(f.name??f["Fee Name"]??""); // charged once per recorded document
// which recorded documents a per-document fee counts (Melissa Gamble 11/02/26): on a sale the buyer pays for the deed, deed of trust and other loan /
// buyer documents (power of attorney, assignment of leases and rents...), the seller for each release; on a refinance the borrower pays for all of them
const perDocCount=(docs,payer,refi)=>docs.filter(([d])=>refi?true:String(payer||"").trim().toLowerCase()==="seller"?d==="Release":d!=="Release").reduce((a,[,[n]])=>a+n,0);
// county-specific rows override statewide ("All") rows with the same key
function pick(rows,st,co,type,key,txCol="Transaction"){const m=rows.filter(r=>eq(r.State,st)&&inCounty(r,co)&&(!txCol||txOK(r[txCol],type)));
 const spec=new Set(m.filter(r=>!isAll(r["County/City"])).map(key));return m.filter(r=>!isAll(r["County/City"])||!spec.has(key(r)))}
function units(amt,unit){unit=String(unit||"").toLowerCase().replace(/[\s$,]/g,"");if(amt<=0)return 0;
 if(unit==="percent")return amt/100;if(unit==="per100")return Math.ceil(amt/100-1e-9);if(unit==="per500")return Math.ceil(amt/500-1e-9);if(unit==="per1000")return Math.ceil(amt/1000-1e-9);return 0}
const r2=x=>Math.round(x*100)/100;

// ---------- transfer / recordation taxes ----------
// Virginia deed taxes are on the consideration OR the most recent assessed value, whichever is greater (Va. Code 58.1-801(A), 58.1-802(A), 58.1-802.3, 58.1-802.4;
// the local tax is one-third of the state tax, 58.1-3800). DC taxes the consideration (DC Code 42-1103(a)(1)(A): value only when there is no or nominal consideration), so DC does not use it.
const assessedOn=i=>i.state==="VA"&&i.type!=="refi"&&(+i.assessed||0)>(+i.price||0);
function basisOf(b,i){b=String(b||"").toLowerCase();if(b.startsWith("new"))return i.type==="refi"?Math.max(0,i.loan-i.payoff):0;
 if(b.startsWith("loan"))return i.type==="cash"?0:i.loan;return i.type==="refi"?0:assessedOn(i)?+i.assessed:i.price}
// Maryland State transfer tax for a first-time Maryland home buyer who will live there: 0.25% (the sheet's FTHB Rate) and "paid entirely by the seller"
// (Tax-Property 13-203(b)(3); Real Property 14-104(c)(2)). In effect the buyer's half is exempt and the seller pays its usual half; the payer cannot be changed.
const fthbFixed=(t,i)=>i.state==="MD"&&/^state transfer tax$/i.test(String(t["Tax Name"]).trim());
function taxAmount(t,i){const base=basisOf(t.Basis,i);if(!(base>0))return null;const from=num(t["Bracket From ($)"])||0,to=num(t["Bracket To ($)"]);const hi=to==null?Infinity:to;
 const maxP=num(t["FTHB Max Price ($)"]);const fthb=!!i.fthb&&i.occ!==false&&i.type!=="refi"&&(maxP==null||i.price<=maxP);   // first-time buyer programs need a principal residence
 let rate=fthb&&num(t["FTHB Rate"])!=null?num(t["FTHB Rate"]):num(t.Rate)||0;
 // Virginia local recordation taxes are exactly one-third of the state tax (58.1-3800): the sheet's 0.0833 (or 0.06) is read as 1/3 of 0.25 (or 0.18), so no odd cents
 if(i.state==="VA"&&/^local\b.*recordation/i.test(String(t["Tax Name"])))rate=Math.round(rate*300)/300;
 const exempt=(i.occ?num(t["Owner-Occ Exempt ($)"])||0:0)+(fthb?num(t["FTHB Exempt ($)"])||0:0);
 let taxable;if(String(t["Bracket Method"]).toLowerCase().startsWith("marg")){taxable=Math.max(0,Math.min(hi,base)-Math.max(from,exempt))}
 else{if(base<from-1e-9||base>hi+1e-9)return null;taxable=Math.max(0,base-exempt)}
 const amt=r2(units(taxable,t["Rate Unit"])*rate);
 // WHO pays never depends on the First-time homebuyer box: the default is always the sheet's "Paid By" (Maryland: Split 50/50). The sheet's "FTHB Paid By" (Seller in Maryland) is only reported as a note (fthbPayer), never applied.
 const payer=String(t["Paid By"]).trim().toLowerCase(),fp=fthb?String(t["FTHB Paid By"]||"").trim().toLowerCase():"";
 // fthb = the first-time-buyer RATE or EXEMPTION really changed this tax's amount (so the label "(first-time buyer)" only appears where the numbers differ)
 const changes=fthb&&((num(t["FTHB Rate"])!=null&&num(t["FTHB Rate"])!==(num(t.Rate)||0))||(num(t["FTHB Exempt ($)"])||0)>0);
 const fixed=fthb&&fthbFixed(t,i);
 return{amt,payer:fixed?"seller":payer,fthb:!!changes,fixed,fthbPayer:!fixed&&fp&&fp!==payer?fp:""}}

// ---------- title premiums ----------
function uwRows(rows,uw,st){const m=rows.filter(r=>eq(r.State,st)&&eq(r.Underwriter,uw));return m.length||st!=="FL"?m:rows.filter(r=>eq(r.State,st))} // FL promulgated: any underwriter's rows
function rule(R,uw,st,k){const r=uwRows(R.Premium_Rules,uw,st).find(x=>eq(x.Setting,k));return r?num(r.Value):null}
function bandPremium(R,uw,st,pol,rt,amt){const b=uwRows(R.Premium_Tiers,uw,st).filter(x=>eq(x.Policy,pol)&&eq(x["Rate Type"],rt));if(!b.length||!(amt>0))return null;
 const rnd=rule(R,uw,st,"round_coverage_to")||1000;const a=Math.ceil(amt/rnd-1e-9)*rnd;let p=0;
 for(const x of b){const f=num(x["Band From ($)"])||0,t=num(x["Band To ($)"]);const part=Math.min(a,t==null?Infinity:t)-f;if(part>0)p+=part/1000*(num(x["Rate per $1,000"])||0)+(num(x["Flat Amount ($)"])||0)}
 const mn=rule(R,uw,st,pol==="Owner"?"min_premium_owner":"min_premium_lender")||0;return r2(Math.max(p,mn))}
function ownerPremium(R,i){const rt=i.rate==="reissue"?"Reissue":"Basic";let p=bandPremium(R,i.uw,i.state,"Owner",rt,i.price);if(p==null&&rt==="Reissue")p=bandPremium(R,i.uw,i.state,"Owner","Basic",i.price);
 if(p!=null&&i.pol==="enhanced"&&rt==="Basic"){const e=bandPremium(R,i.uw,i.state,"Owner","Enhanced",i.price);const pct=rule(R,i.uw,i.state,"enhanced_owner_pct");if(e!=null)p=e;else if(pct)p=r2(p*pct/100)}return p}
function premiums(R,i){const W=[],o={owner:null,lenderActual:null,lenderFull:null};
 if(i.type!=="refi"){o.owner=ownerPremium(R,i);if(o.owner==null)W.push(`No active ${i.uw} owner's premium rates for ${i.state} in the fee sheet — owner's policy not included.`)}
 if(i.type!=="cash"&&i.loan>0){
  if(i.type==="refi"){const rt=i.rate==="reissue"?"Reissue":"Refinance";let p=bandPremium(R,i.uw,i.state,"Loan",rt,i.loan);
   if(p==null){p=bandPremium(R,i.uw,i.state,"Loan","Basic",i.loan);if(p!=null)W.push(`No ${i.uw} ${i.state} ${rt.toLowerCase()} loan rates in the fee sheet — lender's policy shown at the basic (purchase) rate, which may overstate it.`)}
   o.lenderFull=o.lenderActual=p}
  else{o.lenderFull=bandPremium(R,i.uw,i.state,"Loan","Basic",i.loan);const sim=rule(R,i.uw,i.state,"simultaneous_lender_flat");
   if(o.owner!=null&&sim!=null&&o.lenderFull!=null){let x=sim;if(rule(R,i.uw,i.state,"simultaneous_excess_charged")&&i.loan>i.price)x+=Math.max(0,o.lenderFull-(bandPremium(R,i.uw,i.state,"Loan","Basic",i.price)||0));o.lenderActual=r2(x)}else o.lenderActual=o.lenderFull}
  if(o.lenderFull==null)W.push(`No active ${i.uw} lender's premium rates for ${i.state} in the fee sheet — lender's policy not included.`)}
 return{...o,warnings:W}}

// ---------- main calculation ----------
// A 50/50 split in whole cents: the two halves always add up exactly to the amount (an odd cent goes to the seller).
const halves=amt=>{const c=Math.round((+amt||0)*100),b=Math.floor(c/2);return[b/100,(c-b)/100]};
const TAX_PAYERS=["seller","split","buyer"];
function calc(R,i){const L=[],W=[],refi=i.type==="refi";
 const add=(sec,item,b,s)=>{b=r2(b||0);s=r2(s||0);if(b||s)L.push({sec,item,b,s})};
 const split=(payer,amt)=>{payer=String(payer||"buyer").toLowerCase();if(payer==="seller"&&!refi)return[0,amt];if(payer==="split"&&!refi)return halves(amt);return[amt,0]};
 const cash=i.type==="cash"||!(i.loan>0);
 // documents being recorded (deed of trust only when there is a loan)
 const docs=Object.entries(i.docs||{}).filter(([d,[n]])=>n>0&&!(d==="Deed of Trust"&&cash));const nDocs=docs.reduce((a,[,[n]])=>a+n,0);
 // title premiums
 const P=premiums(R,i);W.push(...P.warnings);const trid=i.pres!=="actual";
 const flt=refi?"":flTitleOpt(R,i),ownPay=flt?(flt==="seller"||flt==="cha"?"Seller":"Buyer"):(i.ownPay||ownerPayDefault(R,i.state,i.county));
 if(P.lenderFull!=null){const lend=trid?P.lenderFull:P.lenderActual;add(SEC.C,"Title – Lender's Title Policy",lend,0)}
 if(P.owner!=null){let own=P.owner;if(trid&&P.lenderFull!=null&&P.lenderActual!=null)own=P.owner+P.lenderActual-P.lenderFull;
  add(SEC.H,"Title – Owner's Title Policy (optional)"+(trid&&P.lenderFull!=null?" [TRID simultaneous-issue]":""),...split(ownPay,Math.max(0,own)))}
 // endorsements
 for(const code of i.ends||[]){const e=uwRows(R.Endorsements,i.uw,i.state).find(x=>eq(x.Code,code));if(!e||!txOK(e.Transaction,i.type))continue;
  const onOwner=eq(e["Applies To"],"Owner");if(!onOwner&&cash)continue;let base=onOwner?P.owner:P.lenderActual;if(base==null)continue;
  // "% of Combined Premium": owner's + simultaneously issued loan premium (e.g. FL Form 9, 69O-186.005(9))
  if(/combined/i.test(e.Pricing)&&!onOwner&&P.owner!=null&&i.type==="purchase")base=P.owner+P.lenderActual;
  const amt=String(e.Pricing).includes("%")?r2(base*(num(e.Amount)||0)/100):num(e.Amount)||0;add(SEC.C,`Title – Endorsement ${e.Code} ${e.Name}`,amt,0)}
 // CLA fees (amounts may be edited in the UI)
 for(const f of i.fees||[]){if(refi&&eq(f.payer,"Seller"))continue;if(cash&&lenderOnly(f))continue; // refi: no seller rows; cash: no lender-only fees
  const per=perDoc(f),cnt=per?perDocCount(docs,f.payer,refi):0,amt=per?f.amt*cnt:f.amt,sc=SEC[String(f.sec||"C").toUpperCase()]||SEC.C,
   nm=per?`E-recording fee (Simplifile) – ${cnt} doc${cnt===1?"":"s"} × ${fmt(f.amt)}`:(NOT_TITLE.test(f.name)?"":"Title – ")+f.name;
  if(flt&&FL_SEARCH.test(f.name)&&!eq(f.payer,"Seller")){const capped=FL_CAPPED.test(f.name),sAmt=flt==="seller"?amt:flt==="mdb"?(capped?Math.min(amt,FL_SEARCH_CAP):amt):0;
   add(sc,nm+(flt==="seller"?" (seller chose title)":flt==="cha"?" (Charlotte custom: buyer pays)":flt==="mdb"?(capped?` (Miami-Dade/Broward custom: seller pays up to ${fmt(FL_SEARCH_CAP)})`:" (Miami-Dade/Broward custom: seller pays)"):""),amt-sAmt,sAmt);continue}
  add(sc,nm,...split(f.payer,amt))}
 // recording fees
 for(const[d,[n,pg]]of docs){
  const rows=pick(R.Recording_Fees,i.state,i.county,i.type,r=>r.Document+"|"+r["Fee Name"],null).filter(r=>eq(r.Document,d)&&(num(r["Page Tier From"])==null||pg>=num(r["Page Tier From"]))&&(num(r["Page Tier To"])==null||pg<=num(r["Page Tier To"])));
  if(!rows.length){W.push(`No recording fee found for ${d} in ${i.county||"(county)"}, ${i.state}.`);continue}
  // Melissa Gamble 11/02: a county lien certificate row (MD, filed under Deed on the sheet) is its own line, not folded into the deed's recording fee (same amount, same payer, so totals do not change)
  const lienRows=rows.filter(r=>LIEN_CERT.test(r["Fee Name"])),recRows=rows.filter(r=>!LIEN_CERT.test(r["Fee Name"]));
  let amt=0,payer=(recRows[0]||rows[0])["Paid By"];for(const r of recRows){const inc=num(r["Pages Included"]);amt+=(num(r["Flat Fee ($)"])||0)+(inc!=null?Math.max(0,pg-inc)*(num(r["Per Add'l Page ($)"])||0):0)}
  // Maryland (RP 3-601(a)(2)(iv)): an instrument of 10+ pages that does not solely involve a principal residence records for $115 (instead of $60); occ is the "principal residence" answer
  let big=false;if(i.state==="MD"&&i.occ===false&&MD_BIG_INSTR[d]){const base=rows.filter(r=>/^Recording fee/i.test(r["Fee Name"])).reduce((a,r)=>a+(num(r["Flat Fee ($)"])||0),0);if(base>0){amt+=MD_BIG_INSTR[d]-base;big=true}}
  if(recRows.length)add(SEC.E,`Recording fees – ${d}${n>1?" ×"+n:""}${big?" (not a principal residence)":""}`,...split(payer,amt*n));
  for(const r of lienRows)add(SEC.E,`Lien certificate – ${lienPlace(i.county)}`,...split(r["Paid By"],(num(r["Flat Fee ($)"])||0)*n))}
 // transfer and recordation taxes
 const taxes=pick(R.Transfer_Taxes,i.state,i.county,i.type,r=>r["Tax Name"]+"|"+r.Transaction);let anyTax=false;const agg={};
 for(const t of taxes){const x=taxAmount(t,i);if(!x)continue;anyTax=true;const k=t["Tax Name"],adj=/^sale/i.test(String(t.Basis||"").trim());const a=agg[k]=agg[k]||{amt:0,payer:x.payer,fthb:false,fixed:false,fthbPayer:"",adj:true,onAssessed:false};a.amt+=x.amt;a.fthb=a.fthb||x.fthb;a.fixed=a.fixed||x.fixed;a.fthbPayer=a.fthbPayer||x.fthbPayer;a.adj=a.adj&&adj;a.onAssessed=a.onAssessed||(adj&&assessedOn(i))}
 const TX=[];
 for(const[k,v]of Object.entries(agg)){const adjustable=v.adj&&!refi&&!v.fixed,def=v.payer,want=adjustable&&i.taxPayers?String(i.taxPayers[k]||"").toLowerCase():"",ov=TAX_PAYERS.includes(want)?want:"";
  let eff=def,tag="";
  if(v.fixed){eff="seller";tag=" (first-time buyer: buyer exempt, seller pays)"}
  else if(ov){eff=ov;if(ov!==def)tag=ov==="split"?"":ov==="buyer"?" (paid by buyer)":" (paid by seller)"}
  else if(i.buyerPaysSellerTax&&def==="seller"){eff="buyer";tag=" (buyer paying seller's tax)"}
  if(eff==="split"&&!refi)tag=" (split 50/50)";
  const label=k+(v.fthb&&!v.fixed?" (first-time buyer)":"")+(v.onAssessed?" (on assessed value)":"")+tag;
  add(SEC.E,label,...split(eff,v.amt));
  TX.push({name:k,label,amt:r2(v.amt),def,payer:eff,adjustable,fixed:v.fixed,fthb:v.fthb,fthbPayer:v.fthbPayer,onAssessed:v.onAssessed})}
 if(i.fthb&&i.occ===false&&!refi)W.push("First-time homebuyer programs need an owner-occupied principal residence: the first-time buyer treatment is not applied.");
 if(!anyTax&&!refi&&i.price>0)W.push(`No transfer/recordation taxes found for ${i.county||"(county)"}, ${i.state}.`);
 // buyer's agent costs (Janette Fiallo 11/02): optional, buyer column, H. Other; blank / 0 = no line. Not on a refinance.
 if(!refi){const bpc=commission(+i.price||0,i.buyerPaidComm);if(bpc>0)add(SEC.H,"Commission paid by buyer"+(i.buyerPaidComm.mode==="flat"?"":` (${+i.buyerPaidComm.val||0}% of price)`),bpc,0);
  if(+i.brokerAdminFee>0)add(SEC.H,"Broker admin fee (buyer's broker)",+i.brokerAdminFee,0)}
 const order=[SEC.B,SEC.C,SEC.E,SEC.H];L.sort((a,b)=>order.indexOf(a.sec)-order.indexOf(b.sec));
 const B=r2(L.reduce((a,x)=>a+x.b,0)),S=r2(L.reduce((a,x)=>a+x.s,0));return{lines:L,warnings:W,buyer:B,seller:S,total:r2(B+S),premiums:P,taxes:TX}}
function fmt(x){return"$"+(+x).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
function claFees(R,st,type){return R.CLA_Fees.filter(f=>eq(f.State,st)&&txOK(f.Transaction,type)&&!(type==="refi"&&eq(f["Paid By"],"Seller"))&&!(type==="cash"&&lenderOnly(f)))}

// ---------- per-rep special SETTLEMENT fee (migration 16; portal/README.md "Rep special pricing") ----------
// ONLY the line "Settlement Fee to CLA Title & Escrow" can ever be replaced. Premiums, endorsements, recording fees, taxes and every other
// CLA fee (notary, doc prep, search, storage...) never go through this code, so they cannot change. calc() itself is untouched: the replaced
// amount is handed to it through the same fees list the page already builds. No override (or none that matches) = the fee sheet amount.
// ov rows: {state:"*"|"MD"|..., transaction:"purchase"|"refi", paidBy:"buyer"|"seller", amount}; a state row beats the "*" (all states) row.
const isSettlementFee=n=>/^settlement fee to cla title/i.test(String(n??"").trim());
const feeSide=p=>{p=String(p??"").trim().toLowerCase();return p==="buyer"||p==="borrower"?"buyer":p==="seller"?"seller":null};
function repFeeOverride(ov,st,type,name,payer){if(!isSettlementFee(name))return null;const side=feeSide(payer);if(!side)return null;
 const tx=type==="refi"?"refi":"purchase",rows=(ov||[]).filter(o=>o&&eq(o.transaction,tx)&&eq(o.paidBy,side)&&(o.state==="*"||eq(o.state,st)));
 const hit=rows.find(o=>eq(o.state,st))||rows.find(o=>o.state==="*");if(!hit||hit.amount==null)return null;/* a state's own fee set beats the all-states set; an amount of null in it = standard fee for that line */const a=num(hit.amount);return a!=null&&a>=0?r2(a):null}
function applyRepFees(fees,ov,st,type){return(fees||[]).map(f=>{const a=repFeeOverride(ov,st,type,f.name,f.payer);return a==null?f:Object.assign({},f,{amt:a,std:f.amt,special:true})})}

// ---------- seller net sheet (reuses calc's seller column; nothing about fees/taxes is re-derived here) ----------
const MS_DAY=864e5,MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const pDate=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||"").trim());if(!m)return null;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]?d:null};
const longDate=d=>d?`${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`:"";
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
// Default "taxes paid through" date = end of the latest billing period whose installment was due on or before closing (assumes bills are paid when due).
// Installment: [start m,d, end m,d, end-year offset, due m,d, due-year offset] relative to the period's start year. Estimates; localities differ (esp. VA).
const TAX_SCHED={
 MD:{note:"MD fiscal year Jul 1–Jun 30, billed in advance; owner-occupied semiannual (due Sep 30 and Dec 31)",inst:[[7,1,12,31,0,9,30,0],[1,1,6,30,0,12,31,-1]]},
 DC:{note:"DC tax year Oct 1–Sep 30; halves due Mar 31 and Sep 15",inst:[[10,1,3,31,1,3,31,1],[4,1,9,30,0,9,15,0]]},
 VA:{note:"VA calendar year, Fairfax-style: Jan–Jun due Jul 28, Jul–Dec due Dec 5 (other localities differ)",inst:[[1,1,6,30,0,7,28,0],[7,1,12,31,0,12,5,0]]},
 FL:{note:"FL calendar year, billed in arrears each November",inst:[[1,1,12,31,0,11,30,0]]}};
function defaultPaidThrough(state,closing){const s=TAX_SCHED[state];if(!s||!closing)return null;let best=null;const y0=closing.getUTCFullYear();
 for(let y=y0-2;y<=y0+1;y++)for(const[,,em,ed,ey,dm,dd,dy]of s.inst){const end=new Date(Date.UTC(y+ey,em-1,ed)),due=new Date(Date.UTC(y+dy,dm-1,dd));if(due<=closing&&(!best||end>best))best=end}return best}
// Seller owns every day through the day BEFORE closing (buyer owns the day of closing); 365-day year.
// days > 0: taxes unpaid for those days → debit to seller. days < 0: seller paid ahead → credit to seller.
function prorateTaxes(i){const annual=+i.annual||0,closing=pDate(i.closing);const none={days:0,amount:0,paidThrough:null,assumed:false,note:(TAX_SCHED[i.state]||{}).note||""};
 if(!(annual>0)||!closing)return none;let pt=pDate(i.paidThrough),assumed=false;if(!pt){pt=defaultPaidThrough(i.state,closing);assumed=true}if(!pt)return none;
 const days=Math.round((closing-MS_DAY-pt)/MS_DAY);return{days,amount:r2(annual*days/365),paidThrough:pt,assumed,note:none.note}}
// Florida: the three title options of the Florida Realtors / Florida Bar "AS IS" contract, paragraph 9(c).
// seller = (i) seller chose title: seller pays the owner's policy, title search and municipal lien search;
// buyer  = (ii) buyer chose title: buyer pays all of them;
// mdb    = (iii) Miami-Dade/Broward regional provision: buyer pays the owner's policy; seller pays the title search /
//          continuation (up to $200 unless the contract says otherwise), tax search and municipal lien search.
// cha    = Charlotte County custom (John 11/02/26): seller pays the owner's policy; buyer pays the title search (not an AS IS 9(c) option).
// Old saved values keep working: "" = local custom, "Seller" = (i), "Buyer" = (ii). Local custom: Miami-Dade and Broward
// use (iii); Charlotte uses the Charlotte custom (cha); otherwise the sheet's Owner Policy Paid By (Collier and Sarasota say Buyer -> (ii); everywhere else, Lee included, (i)).
// John 11/02/26: the Lien Search Fee Estimate is always the buyer's, whatever the Who chose title option, so "lien search" is not in FL_SEARCH
const FL_MDB=/^(miami-dade|broward)$/i,FL_CHA=/^charlotte$/i,FL_SEARCH=/title search|tax search/i,FL_SEARCH_CAP=200;
// 9(c)(iii): the $200 limit is on the title search / continuation only; the seller pays the tax search and municipal lien search in full
const FL_CAPPED=/title search|continuation/i;
// a sheet fee that is not a title charge (a survey estimate) is listed without the "Title – " prefix
const NOT_TITLE=/^survey\b/i;
const FL_TITLE={seller:"Seller chose title",buyer:"Buyer chose title",mdb:"Miami-Dade/Broward custom",cha:"Charlotte custom"};
const FL_TITLE_HINT={seller:"seller pays the owner's policy and title search (AS IS contract 9(c)(i)); the lien search estimate stays with the buyer",buyer:"buyer pays the owner's policy, title search and lien search estimate (AS IS contract 9(c)(ii))",mdb:"buyer pays the owner's policy; seller pays the title search (up to $200) (AS IS contract 9(c)(iii)); the lien search estimate stays with the buyer",cha:"seller pays the owner's policy; buyer pays the title search and lien search estimate (Charlotte County custom)"};
function flTitleOpt(R,i){if(i.state!=="FL")return"";const v=String(i.ownPay||"");if(v==="MDB")return"mdb";if(v==="CHA")return"cha";if(v==="Seller")return"seller";if(v==="Buyer")return"buyer";
 const co=String(i.county||"").trim();return FL_MDB.test(co)?"mdb":FL_CHA.test(co)?"cha":ownerPayDefault(R,"FL",i.county)==="Seller"?"seller":"buyer"}
function ownerPayDefault(R,st,co){const j=R.Jurisdictions.find(j=>eq(j.State,st)&&eq(j["County/City"],co));return j&&String(j["Owner Policy Paid By"]).trim()?j["Owner Policy Paid By"]:"Buyer"}
const sellerFeeRows=(R,st)=>claFees(R,st,"cash").filter(f=>["seller","split"].includes(String(f["Paid By"]).trim().toLowerCase()));
const sellerFeeInputs=(R,st,ov)=>applyRepFees(sellerFeeRows(R,st).filter(f=>f["Default On"]!=="N").map(f=>({name:f["Fee Name"],payer:f["Paid By"],tx:f.Transaction,sec:f["LE Section"],amt:num(f.Amount)||0})),ov,st,"purchase");
const commission=(price,c)=>{c=c||{};const v=+c.val||0;return c.mode==="flat"?r2(v):r2(price*v/100)};
// down payment ($ or % of price) -> loan amount (Janette Fiallo 11/02). val null / blank = not entered (the loan amount is typed directly).
const downAmt=(price,d)=>d&&d.val!=null&&d.val!==""?Math.min(+price||0,Math.max(0,commission(+price||0,{mode:d.mode,val:+d.val}))):null;
const loanFromDown=(price,d)=>{const a=downAmt(price,d);return a==null?null:r2(Math.max(0,(+price||0)-a))};
function sellerNet(R,i){const price=+i.price||0,W=[],sum=a=>r2(a.reduce((t,x)=>t+x.amt,0));
 const bc=commission(price,i.buyerComm),sc=commission(price,i.sellerComm),pc=c=>c&&c.mode!=="flat"?` (${+c.val||0}%)`:" (flat)";
 const releases=(+i.payoff1>0?1:0)+(+i.payoff2>0?1:0),ownPay0=i.ownerPays==null?ownerPayDefault(R,i.state,i.county):i.ownerPays?"Seller":"Buyer",
  ownPay=i.state==="FL"&&ownPay0==="Buyer"&&FL_MDB.test(String(i.county||"").trim())?"MDB":i.state==="FL"&&ownPay0==="Seller"&&FL_CHA.test(String(i.county||"").trim())?"CHA":ownPay0;
 // Florida: the title search row is a buyer row on the sheet, but the seller pays it under 9(c)(i) and (iii), so it is offered here too
 let sfees=i.fees||sellerFeeInputs(R,i.state);if(i.state==="FL"){const have=new Set(sfees.map(f=>f.name));sfees=sfees.concat(applyRepFees(claFees(R,"FL","purchase").filter(f=>FL_SEARCH.test(f["Fee Name"])&&!eq(f["Paid By"],"Seller")&&f["Default On"]!=="N"&&!have.has(f["Fee Name"])).map(f=>({name:f["Fee Name"],payer:f["Paid By"],tx:f.Transaction,sec:f["LE Section"],amt:num(f.Amount)||0})),i.repOv,"FL","purchase"))}
 // a cash-style purchase (no buyer loan) so only seller lines remain; actual premium split, so the seller pays the full owner's premium
 const q=calc(R,{type:"cash",state:i.state,county:i.county,uw:i.uw,price,assessed:+i.assessed||0,loan:0,payoff:0,pol:i.pol||"enhanced",rate:i.rate||"basic",fthb:!!i.fthb,occ:true,ownPay,pres:"actual",ends:[],
  docs:{"Deed":[1,3],"Deed of Trust":[0,30],"Release":[releases,3],"Power of Attorney":[0,3]},fees:sfees,buyerPaysSellerTax:!!i.bpst,taxPayers:i.taxPayers});
 W.push(...q.warnings.filter(w=>!/lender/i.test(w)&&!(/owner's premium/.test(w)&&ownPay0!=="Seller")));
 const gov=[],title=[];for(const l of q.lines)if(l.s>0)(/^Title – /.test(l.item)?title:gov).push({item:l.item.replace(/^Title – /,""),amt:l.s});
 const commissions=[{item:"Buyer's broker commission"+pc(i.buyerComm),amt:bc},{item:"Seller's broker commission"+pc(i.sellerComm),amt:sc}];if(+i.brokerAdminFee>0)commissions.push({item:"Broker admin fee",amt:r2(+i.brokerAdminFee)});
 const payoffs=[];if(+i.payoff1)payoffs.push({item:"1st mortgage payoff",amt:r2(+i.payoff1)});if(+i.payoff2)payoffs.push({item:"2nd mortgage / HELOC payoff",amt:r2(+i.payoff2)});
 const pr=prorateTaxes({state:i.state,annual:i.annualTax,closing:i.closing,paidThrough:i.paidThrough}),pro=[];
 if(pr.amount)pro.push({item:pr.days>0?`Real estate taxes — seller owes ${pr.days} day${pr.days===1?"":"s"}`:`Real estate taxes — credit to seller for ${-pr.days} day${pr.days===-1?"":"s"}`,amt:pr.amount});
 if(Math.abs(pr.days)>366)W.push("The tax proration covers more than a year — check the “taxes paid through” date.");
 if(+i.hoaDues)pro.push({item:"HOA dues owed through closing",amt:r2(+i.hoaDues)});
 const cc=commission(price,i.concession);if(cc)pro.push({item:"Seller concession / credit to buyer"+(i.concession&&i.concession.mode==="pct"?` (${+i.concession.val||0}%)`:""),amt:cc});
 const other=[];const o=(item,a)=>{if(+a)other.push({item,amt:r2(+a)})};
 o("HOA transfer / resale package fee",i.hoaTransfer);o("HOA special assessment",i.special);o("Home warranty",i.warranty);o("Termination / other fees",i.termination);
 (i.other||[]).slice(0,5).forEach(x=>o((x.label||"").trim()||"Other seller cost",x.amt));
 const T={commissions:sum(commissions),gov:sum(gov),title:sum(title),pro:sum(pro),other:sum(other),payoffs:sum(payoffs)};
 const totalCosts=r2(T.commissions+T.gov+T.title+T.pro+T.other);
 const wh=mdWithholding(i,{price,commissions,gov,title,other,pro,payoffs:T.payoffs});
 return{price,commissions,gov,title,payoffs,prorations:pro,other,totals:T,totalCosts,payoffTotal:T.payoffs,withholding:wh,net:r2(price-totalCosts-T.payoffs-(wh?wh.amount:0)),warnings:W,proration:pr,calc:q,sellerColumn:q.seller}}
// Maryland non-resident seller withholding (Tax-General 10-912; Form MW506NRS line 8; Melissa Gamble 11/02/26). Only for MD property, only when ticked.
// Line 8: a total sales price - b selling expenses (commission and any other expenses due from the seller in connection with the sale) = c net sales
// price - d mortgages / other liens on the property = e total payment; x f ownership % = g seller's share; x h rate = i withholding.
// A Certificate of Partial / Full Exemption (MW506AE / MW506E) replaces lines a-h with its amount. Adjustments in the seller's favor (credits to the
// seller, e.g. a tax proration the buyer pays back) are not selling expenses, so only positive costs are deducted.
// Rates (Comptroller Tax Alert, sales after 6/30/2025): individual / estate / trust 8.75% (the 2024 form Melissa sent still says 8.0%), entity 8.25%.
const MD_NRW_RATE={individual:8.75,entity:8.25};
function mdWithholding(i,x){if(i.state!=="MD"||!i.nonRes)return null;const pos=a=>a.reduce((t,r)=>t+Math.max(0,+r.amt||0),0);
 const expenses=r2(pos(x.commissions)+pos(x.gov)+pos(x.title)+pos(x.other)+pos(x.pro)),netSales=r2(x.price-expenses),total=r2(Math.max(0,netSales-x.payoffs));
 const own=i.nonResOwn==null||i.nonResOwn===""?100:Math.min(100,Math.max(0,+i.nonResOwn)),share=r2(total*own/100),kind=i.nonResType==="entity"?"entity":"individual",rate=MD_NRW_RATE[kind];
 const cert=i.nonResCert!=null&&i.nonResCert!==""&&isFinite(+i.nonResCert)?Math.max(0,r2(+i.nonResCert)):null,amount=cert!=null?cert:r2(share*rate/100);
 return{kind,rate,price:r2(x.price),expenses,netSales,payoffs:r2(x.payoffs),total,own,share,cert,amount,
  item:cert!=null?"Maryland non-resident withholding (exemption certificate amount)":`Maryland non-resident withholding (${kind==="entity"?"entity":"individual / estate / trust"} ${rate}% of ${own<100?own+"% of ":""}${fmt(total)} total payment)`}}

// ---------- county list + ZIP lookup (data: zip-county.js, Census 2020) ----------
const _C=typeof CLA_COUNTIES!=="undefined"?CLA_COUNTIES:{},_Z=typeof CLA_ZIPS!=="undefined"?CLA_ZIPS:{};
function allCounties(R,st){const set=new Set(Object.values(_C).filter(c=>c[0]===st).map(c=>c[1]));const has=n=>[...set].some(x=>eq(x,n));
 R.Transfer_Taxes.concat(R.Recording_Fees).forEach(x=>{if(eq(x.State,st)&&!isAll(x["County/City"]))String(x["County/City"]).split(",").forEach(c=>{c=c.trim();if(c&&!has(c))set.add(c)})});return[...set].sort((a,b)=>a.localeCompare(b))}
// True when no county-specific tax/recording rows exist for this county (statewide rows apply). DC is a single jurisdiction.
function usesDefaults(R,st,co){if(st==="DC")return false;return!R.Transfer_Taxes.concat(R.Recording_Fees).some(x=>eq(x.State,st)&&!isAll(x["County/City"])&&String(x["County/City"]).split(",").some(c=>eq(c,co)))}
function zipLookup(z){z=String(z||"").trim();if(!/^\d{5}$/.test(z))return null;let k=z,approx=false;
 if(!_Z[k]){const c=Object.keys(_Z).filter(x=>x.slice(0,3)===z.slice(0,3));if(!c.length)return null;k=c.reduce((a,b)=>Math.abs(b-z)<Math.abs(a-z)?b:a);approx=true}
 const f=_Z[k].split(",").map(x=>_C[x]).filter(Boolean);if(!f.length)return null;return{state:f[0][0],county:f[0][1],also:f.slice(1).map(c=>c[1]+(c[0]!==f[0][0]?", "+c[0]:"")),approx,via:k}}
// ---------- loading: live sheet, falling back to embedded snapshot ----------
const SNAP=typeof CLA_FEES_SNAPSHOT!=="undefined"?CLA_FEES_SNAPSHOT:{};
async function fetchSheet(fetchFn){const raw={};await Promise.all(TABS.map(async t=>{const r=await fetchFn(sheetCsvUrl(t),{cache:"no-store"});
 if(!r.ok)throw Error(`${t}: HTTP ${r.status}`);const rows=parseCSV(await r.text());if(!validTab(rows)){if(REQUIRED.includes(t))throw Error(`${t}: unexpected content (is the sheet shared "anyone with the link"?)`);return}raw[t]=rows}));return raw}
async function loadFees(fetchFn){try{const raw=await fetchSheet(fetchFn);return{raw,source:"sheet",at:new Date()}}catch(e){return{raw:SNAP,source:"snapshot",error:String(e.message||e)}}}
if(typeof module!=="undefined")module.exports={lenderOnly,perDoc,parseCSV,normalize,calc,premiums,taxAmount,DOC_DEFAULTS,allCounties,usesDefaults,zipLookup,loadFees,fetchSheet,claFees,SNAP,SHEET_ID,sheetCsvUrl,TABS,sellerNet,mdWithholding,MD_NRW_RATE,perDocCount,prorateTaxes,defaultPaidThrough,sellerFeeRows,sellerFeeInputs,commission,downAmt,loanFromDown,ownerPayDefault,isSettlementFee,repFeeOverride,applyRepFees,halves};

// ---- end of verbatim code ----
export { lenderOnly, perDoc, parseCSV, normalize, calc, premiums, taxAmount, DOC_DEFAULTS, allCounties, usesDefaults, claFees, SNAP, TABS, perDocCount, commission, ownerPayDefault, isSettlementFee, repFeeOverride, applyRepFees, halves, pick, uwRows, rule, bandPremium, basisOf, units, txOK, eq, num, isAll, inCounty, assessedOn, flTitleOpt, SEC, MD_BIG_INSTR, LIEN_CERT, NOT_TITLE, FL_SEARCH, FL_CAPPED, FL_SEARCH_CAP, FL_TITLE, r2, fmt };
