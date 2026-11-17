/* Where a file's property sits, for Taxes & Fees (FF-095).
 * Street, city, state, ZIP, and county are the columns on the file. County is a name, not an id.
 * A blank county is not a missing address. The ZIP table is the same Census file Place Order already uses. Nothing is fetched. */
import { countiesFor, parseZipTable } from './crm-janine.js?v=202611101600';
import { COUNTIES, ZIPS } from './zip-county-data.js?v=202611070139';

const ZIP_TABLE = parseZipTable(COUNTIES, ZIPS);

export function textField(deal, key) {
  return String(deal && deal[key] != null ? deal[key] : '').trim();
}

/* The address the file header shows: street, city, and ZIP. County is separate. */
export function addressOnFile(deal) {
  return !!(textField(deal, 'street') && textField(deal, 'city') && textField(deal, 'zip'));
}

export function zipCounties(zip) {
  return countiesFor(ZIP_TABLE, zip);
}
