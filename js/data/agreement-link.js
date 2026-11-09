/* Match an acknowledgement to the agreement text the person was shown.
 * An older version, or a different agreement, does not count. */
const ackCode = (k) => (k && (k.agreementCode || k.code)) || '';
const ackAt = (k) => k.acknowledgedAt || k.at || null;

export function withMyAcknowledgements(agreements, acks) {
  return (agreements || []).map((g) => {
    const m = (acks || []).find((k) => k && ackCode(k) === g.code && Number(k.version) === Number(g.version));
    return { ...g, myAck: m ? { at: ackAt(m), roleLabel: m.roleLabel || '' } : null };
  });
}
