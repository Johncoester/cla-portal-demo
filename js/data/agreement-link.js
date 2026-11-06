/* Match an acknowledgement to the agreement text the person was shown.
 * An older version, or a different agreement, does not count. */
export function withMyAcknowledgements(agreements, acks) {
  return (agreements || []).map((g) => {
    const m = (acks || []).find((k) => k && k.agreementCode === g.code && Number(k.version) === Number(g.version));
    return { ...g, myAck: m ? { at: m.acknowledgedAt, roleLabel: m.roleLabel } : null };
  });
}
