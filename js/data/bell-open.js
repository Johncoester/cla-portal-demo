// FF-064 / FF-065 (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis Feedback tickets): clicking a
// bell notification left the menu open, and when the person was already on that page nothing happened. A click now closes the
// menu straight away, marks the notification read (waiting at most 1.5 s, so the bell count is right on the next page; a failed
// mark never blocks the visit) and opens the item, drawing the page again when the link is the page already showing.
export async function openNotification({ href, dd, markRead, getHash, setHash, rerender, waitMs = 1500 }) {
  const to = href && href.startsWith('#/') ? href : '#/dashboard';
  if (dd) dd.hidden = true;
  try {
    const p = markRead ? Promise.resolve().then(markRead) : null;
    if (p) await Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, waitMs))]);
  } catch (e) { /* still open the item */ }
  if (getHash() === to) rerender(); else setHash(to);
  return to;
}
