/* Open a file the adapter already returned. Mock rows use a data URL. Hosted rows use a blob. */
export function downloadNamed(content) {
  if (!content) throw new Error('This file could not be opened.');
  const name = content.name || 'download';
  let href = content.dataUrl || '';
  let revoke = null;
  if (!href && content.blob) {
    href = URL.createObjectURL(content.blob);
    revoke = href;
  }
  if (!href) throw new Error('This file has no stored content.');
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(revoke), 1500);
}
