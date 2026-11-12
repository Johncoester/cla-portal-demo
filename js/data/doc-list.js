// Documents tab: search and column sort (Matt, Nov 11 "Processor User-Documents" notes).
// Pure helpers. The page (js/pages/dealdocs.js) wires them to the table. Rows are the ones already loaded for the tab,
// so this adds no request and changes nothing about who can see a document.
export const DOC_SORTS = ['type', 'name', 'folder', 'date', 'from'];
// First click on a column: newest first for dates, A to Z for everything else.
export const DOC_SORT_DIR = { date: 'desc' };

const text = (v) => String(v == null ? '' : v).trim().toLowerCase();

// Everything a person can read on the row: file name, type, folder, who sent it and their role, and the instruction.
export function docSearchText(d) {
  const row = d || {};
  return [row.name, row.docType, row.folderName, row.uploadedByName, row.uploadedByRole, row.description].map(text).filter(Boolean).join(' ');
}

// Every word typed has to appear somewhere on the row. An empty search matches every row.
export function docMatches(d, query) {
  const words = text(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = docSearchText(d);
  return words.every((w) => hay.includes(w));
}

export function docSortValue(d, key) {
  const row = d || {};
  if (key === 'date') { const t = Date.parse(row.createdAt || ''); return Number.isNaN(t) ? null : t; }
  if (key === 'type') return text(row.docType) || null;
  if (key === 'folder') return text(row.folderName) || null;
  if (key === 'from') return text(row.uploadedByName) || null;
  return text(row.name) || null;
}

// A new array in the asked order. Rows with nothing in that column go last either way; ties keep the order they came in.
export function sortDocs(list, key, dir) {
  const rows = Array.isArray(list) ? list.slice() : [];
  if (!DOC_SORTS.includes(key)) return rows;
  const sign = dir === 'desc' ? -1 : 1;
  return rows.map((d, i) => ({ d, i, v: docSortValue(d, key) })).sort((a, b) => {
    if (a.v === null && b.v === null) return a.i - b.i;
    if (a.v === null) return 1;
    if (b.v === null) return -1;
    const c = typeof a.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), 'en', { numeric: true });
    return c ? c * sign : a.i - b.i;
  }).map((x) => x.d);
}
