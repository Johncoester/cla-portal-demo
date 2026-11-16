// Who may be picked as the owner of a CRM record. The tick starts off for everyone.
// Sales Person and Sales Team still decide who can see the sales team's records. That is separate.
export const canOwnCrmRecords = (p) => !!p && p.status === 'active' && p.canOwnCrm === true;
