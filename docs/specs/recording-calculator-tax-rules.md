# Recording calculator: confirmed tax rules (read before changing taxes)

One place for the recording and tax rules CLA has confirmed. Anyone changing the calculator (the cla-closing-cost-calculator repo, copied into `js/data/vendor/cla-calculator/`) or `js/data/fee-engine.js` checks this list first. Add a line here whenever Melissa Gamble or John confirms a rule.

Who answers: Melissa Gamble (recording). Send recording questions to Recording@clatitle.com.

## Confirmed rules

| # | Rule | Where it's built | Confirmed by |
|---|---|---|---|
| 1 | **Maryland, loan bigger than the price:** county recordation tax is due on the part of the loan above the price. In Prince George's, the 1.4% county transfer tax is due on it too. The buyer pays. | Calculator PR 2 / REC-CALC-7 | Melissa Gamble, Nov 16 2026 |
| 2 | **Assignment fees are not added to the price** for taxes ("the total is not claimed by the seller"). Tax the contract price only. | Nothing to build. Processors enter the contract price. | Melissa Gamble, Nov 16 2026 |
| 3 | **DC taxes the consideration (price) and the loan amount.** No assessed-value box for DC. | Already how the calculator works | Melissa Gamble, Nov 16 2026 |
| 4 | **Maryland refinance:** recordation tax on new money only, if the borrower signs the original mortgagor affidavit (Tax-Property 12-108(g)). Otherwise tax the whole loan. The calculator shows a note. | REC-CALC-5 | Melissa Gamble, Nov 16 2026 |
| 5 | **Virginia refinance with nothing paid off** is a new loan and pays the full deed of trust rate, not the $0.18 refinance rate. | REC-CALC-5 | John, Nov 15 2026 |
| 6 | **Hampton Roads fee** ($0.06/$100, seller) on Virginia purchases in the Hampton Roads localities. | Rate sheet, Transfer_Taxes row 103 | John, Nov 15 2026 |
| 7 | **Virginia deed taxes** use the higher of price or assessed value. The processor enters the assessed value. | Already built | Va. Code 58.1-801 |
| 8 | **Maryland deed of trust is $115** to record when the property is not a principal residence (investor). | Already built | Melissa Gamble, Nov 2026 |
| 9 | **Anne Arundel lien certificate is $0**. CLA does not order one. | Rate sheet | Melissa Gamble, Oct 26 2026 |
| 10 | **Baltimore City transfer tax**: owner-occupant $22,000 exemption up to $249,900; no exemption above. Caroline recordation $5.00/$500; Caroline first-time buyer exemption $50,000 on top of the $25,000. | Rate sheet | Melissa Gamble, Nov 16 2026 |

## Open questions (do not build until answered)

- **Who gets the owner-occupant exemption on a split tax?** Melissa (Nov 16): "Applies to the buyer side unless the seller agrees to pay 100%." But Lodestar and two closed files (MD-26-31559 Montgomery, MD-26-31956 Washington County) split it 50/50. The calculator still splits the exempted total. FF-091b leaves that as `OWNER_OCCUPANT_EXEMPTION_SIDE = 'exempted-total'` and does not build the buyer-side reading. Waiting on John.
- **Which contract field is the starting tax payer?** FF-091b. There is no Buyer pays / Seller pays / 50/50 field on the file. `CONTRACT_TAX_PAYER_FIELD` is blank. The rate sheet is the start until John names the field.
- **Florida:** an enhanced (Homeowner's) owner's policy at 110% of basic (FL-26-32387) and a $25 condo/PUD endorsement (ALTA 4.1 / 5.1). Waiting on John.

## Closed-file test (Nov 16 2026)

Claude ran Francis's closed files through the calculator (31 of 40 readable). Recording fees were never short, and Virginia taxes matched to the penny. Files that were charged wrong and should not be used as examples:

- **DC-26-32097**: taxed on about $431,630 instead of the $365,000 price. DC was overpaid about $2,727 (buyer $483.07, seller $2,243.63). Melissa: Erin's DC files are not good examples.
- **MD-26-32155**: taxes included the $10,000 assignment fee (rule 2). The county got about $245 too much.
- **MD-26-32211**: the Baltimore City exemption went to the seller's half (see the open question above).
- **FL-26-32311**: no mortgage doc stamps or intangible tax on the statement. Needs checking.

Unreadable (scanned pages): MD-26-32302 and DC-26-32006, 32046, 32071, 32106, 32339, 32519.
