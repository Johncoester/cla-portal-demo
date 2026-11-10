/* Document type list for an upload (MF-005).
 * Miscellaneous/Other is first. Choosing it reveals a free-text label.
 * The stored value stays in documents.doc_type. A blank free-text field stores Other.
 * Hosted rows still have to pass documents_doc_type_check until the free-text migration is applied. */
export const MISC_DOC_TYPE = 'Other';
export const MISC_DOC_LABEL = 'Miscellaneous/Other';
export const DOC_TYPE_MAX = 80;

export function orderedDocTypes(types) {
  const rest = [];
  for (const t of types || []) {
    if (t && t !== MISC_DOC_TYPE && !rest.includes(t)) rest.push(t);
  }
  return [MISC_DOC_TYPE, ...rest];
}

export function docTypeLabel(type) {
  return type === MISC_DOC_TYPE ? MISC_DOC_LABEL : type;
}

export function cleanDocType(value) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, DOC_TYPE_MAX);
}

/* choice is the select value. freeText is used only when the choice is Other. */
export function resolveDocType(choice, freeText) {
  const picked = cleanDocType(choice);
  if (!picked) return '';
  if (picked !== MISC_DOC_TYPE) return picked;
  const free = cleanDocType(freeText);
  return free || MISC_DOC_TYPE;
}

/* A stored custom label reopens as Miscellaneous/Other plus the typed text. */
export function docTypeEditorState(stored, known) {
  const value = cleanDocType(stored);
  if (!value) return { choice: '', free: '' };
  if (value !== MISC_DOC_TYPE && (known || []).includes(value)) return { choice: value, free: '' };
  return { choice: MISC_DOC_TYPE, free: value === MISC_DOC_TYPE ? '' : value };
}

/* Accept a listed type or a short free-text label. Empty stays empty. */
export function acceptDocType(value) {
  return cleanDocType(value);
}
