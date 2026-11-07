/* The files chosen for one upload. Picking again adds to this list. Removing one leaves the rest. */
export function queueKey(file) {
  return `${String(file && file.name || '').trim().toLowerCase()}\0${Number(file && file.size) || 0}`;
}

export function addToQueue(queue, incoming) {
  const next = [...(queue || [])];
  const skipped = [];
  for (const file of incoming || []) {
    const key = queueKey(file);
    if (!file || !file.name) { skipped.push({ name: 'file', reason: 'Choose a file to upload.' }); continue; }
    if (next.some((have) => queueKey(have) === key)) { skipped.push({ name: file.name, reason: 'Already in this selection.' }); continue; }
    next.push(file);
  }
  return { queue: next, skipped };
}

export function removeFromQueue(queue, index) {
  return (queue || []).filter((_, i) => i !== index);
}

export function uploadFailureText(message) {
  const text = String(message || 'The upload failed.');
  if (/row-level security/i.test(text)) return 'This file was not saved. This account cannot add it to this file with that sharing choice. The files you selected are still here, so you can change who can see it and try again.';
  return text;
}
