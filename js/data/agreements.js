/* AGREEMENTS (Matt, Oct 31, item 10). Every OUTSIDE person on a file (agents and clients) is asked to acknowledge these once per file.
 * Who acknowledged what, and when, is recorded; CLA staff see the status. Mirrored by public.agreements / agreement_acks (migration 14).
 * SAMPLE WORDING: CLA Title must supply the final text before go-live. */
export const AGREEMENTS = [
  { code: 'wire_fraud', version: 1, title: 'Wire Fraud Warning',
    body: 'SAMPLE TEXT (CLA to supply final wording). Criminals send fake emails that look like they come from title companies, agents and lenders, with changed wire instructions. '
      + 'CLA Title will never change wire instructions by email, text or phone. Before you wire any money, call CLA Title at a phone number you already know to confirm the instructions. '
      + 'Money wired to a criminal is usually lost for good.' },
  { code: 'privacy', version: 1, title: 'Privacy notice',
    body: 'SAMPLE TEXT (CLA to supply final wording). CLA Title collects the personal information needed to close your transaction (names, contact details, ID, and for sellers, payout details). '
      + 'It is shared only with the parties and service providers needed for the closing, as the law allows, and is kept secure.' },
  { code: 'e_consent', version: 1, title: 'Consent to electronic records and signatures',
    body: 'SAMPLE TEXT (CLA to supply final wording). You agree to receive documents and notices electronically through this portal and, where offered, to sign electronically. '
      + 'You can ask for paper copies at any time by contacting CLA Title.' },
];
export const agreementOf = (code) => AGREEMENTS.find((a) => a.code === code);
