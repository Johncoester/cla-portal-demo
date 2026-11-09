/* John, Nov 9: a file may be opened with no Processor (the AI opener, or a Processor on leave). Staff assign or change one at any time
   (Edit order details). These helpers drive the "Unassigned" badge / filter on Orders and the Work Queue, and fill processorName on
   hosted orders from one small staff-name read (profiles RLS still decides what the caller may see). */
export const UNASSIGNED = 'Unassigned';
export const isUnassigned = (d) => !(d && d.processorId);
export const unassignedOpen = (deals = []) => deals.filter((d) => d && d.status === 'Open' && isUnassigned(d));
export const nameOfProfile = (p) => (p ? `${p.first_name || p.firstName || ''} ${p.last_name || p.lastName || ''}`.trim() || p.email || '' : '');
// names: Map(profileId -> display name). Hosted deals rows carry only processor_id.
export function processorFields(d, names) {
  const id = d && d.processorId ? d.processorId : null;
  const known = id && names && names.get(id);
  return { processorName: id ? (known || (d.processorName && d.processorName !== UNASSIGNED ? d.processorName : '')) : '', processorUnassigned: !id };
}
// ids on the given deals that the name map does not cover yet (one follow-up lookup instead of one per file)
export const missingProcessorIds = (deals = [], names = new Map()) => [...new Set(deals.map((d) => d && d.processorId).filter((id) => id && !names.has(id)))];
