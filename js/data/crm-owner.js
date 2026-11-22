// Who may be picked as the owner of a CRM record. The tick starts off for everyone.
// Sales Person and Sales Team still decide who can see the sales team's records. That is separate.
export const canOwnCrmRecords = (p) => !!p && p.status === 'active' && p.canOwnCrm === true;

// F35 row 415 (Janine Santos, Nov 19 Feedback 35, confirmed Nov 20 2026, 12:40 PM ET).
// Every active Sales Person is an owner choice, together with anyone the tick already includes.
// Sales Team is not added by role. A disabled or removed person is never a choice.
// The tick itself is unchanged. Who may edit a record they do not own is unchanged.
// The same rule is private.rpc_crm_owners and private.crm_owner_check.
export const crmOwnerOption = (p) => !!p && p.status === 'active' && (p.role === 'Sales Person' || p.canOwnCrm === true);
