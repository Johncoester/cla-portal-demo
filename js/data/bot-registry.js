/* Bots that are actually available. A future bot is added here only after its integration is approved.
 * Nothing in this list is connected to an outside service. */
export function botRegistry() {
  return [
    {
      id: 'portal-feedback',
      label: 'Portal feedback',
      detail: 'Text support, one way. Save a note, then send it.',
      configured: true,
    },
  ];
}
