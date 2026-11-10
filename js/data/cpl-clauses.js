/* Francis's CPL lender clauses, in her order and capitalization. The loss-payee box stays editable after a pick. */
export const CPL_CLAUSES = [
  'None',
  'ISAOA',
  'ISAOA/ATIMA',
  'ISAOA ATIMA and/or Warehouse Lender',
  'And/or its Warehouse Lender',
  'Its successors and assigns, as their interest may appear',
  'Its successors and assigns, as their interests may appear',
  'Its successors and/or assigns',
  'Its successors and/or assigns, as their interests may appear',
  'Its Successors and/or Assigns, ATIMA',
  'ISAOA, as their respective interests may appear',
  'And/or United States Department of Agriculture, its respective successors and/or assigns as their interests may appear',
  'Acting through the Rural Housing Service, or successor agency, United States Department of Agriculture, their successors and assigns, as their interests may appear',
  'And/or Secretary of Department of Veterans Affairs, an officer of the United States of America, their respective successors and assigns',
  'And/or the Secretary of Veterans Affairs, their successors and/or assigns as their interest may appear',
  'And/or the Secretary of Veterans Affairs, an Officer of the United States of America, its successors and/or assigns as their interest may appear',
  'And/or the Department of Veterans Affairs, its successors and/or assigns, as their interests may appear',
  'Its successors and/or Administrator of Veteran Affairs and/or assigns, as their respective interests may appear',
  'And/or the Secretary of Housing and Urban Development, their successors and/or assigns, as their interests may appear',
  'And/or the Secretary of Housing and Urban Development of Washington, D.C., their successors and/or assigns as their interests may appear',
  'PAYEE IN NOTE AND/OR SECRETARY OF HOUSING AND URBAN DEVELOPMENT, THEIR SUCCESSORS AND OR ASSIGNS AS THEIR INTEREST MAY APPEAR',
  'Its successors and/or assigns appearing of record as Mortgage Electronic Registration Systems, Inc. as the Insured',
  'Its successors and/or assigns appearing of record as Mortgage Electronic Registration Systems, Inc. as the Nominee',
  'And/or the Secretary of Veterans Affairs, its successors and or assigns appearing of record as Mortgage Electronic Registration Systems, Inc., as nominee',
  'And/or the Secretary of Housing and Urban Development, its successors and or assigns appearing of record as Mortgage Electronic Registration Systems, Inc., as nominee',
  'Appearing of record as Mortgage Electronic Registration Systems, Inc., (MERS), solely as a nominee for lender and lender\'s successors and assigns',
  'And each successor and/or assign that is defined as an Insured in the Conditions.',
  'And each successor and/or assign that is defined as an Insured in the Conditions of the Policy.',
];
export const CPL_OTHER = 'Other / Custom Clause';

export function clauseChoice(stored) {
  const text = String(stored || '');
  if (CPL_CLAUSES.includes(text)) return text;
  if (!text) return '';
  return CPL_OTHER;
}
