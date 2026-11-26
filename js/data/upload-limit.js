/* Over-limit copy for every upload path. X is the real byte limit used on that path.
 * Does not change Storage bucket limits. Maps a server 413 / "Payload too large" to the same message. */
export function formatUploadMax(maxBytes) {
  const n = Number(maxBytes);
  if (!(n > 0) || !Number.isFinite(n)) return '';
  const mib = 1024 * 1024;
  if (n % mib === 0) return `${n / mib} MB`;
  if (n % 1_000_000 === 0) return `${n / 1_000_000} MB`;
  if (n % 1024 === 0 && n < mib) return `${n / 1024} KB`;
  if (n % 1000 === 0 && n < 1_000_000) return `${n / 1000} KB`;
  const mb = n / mib;
  const rounded = Math.round(mb * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded} MB`;
}

export function uploadTooLargeMessage(maxBytes) {
  return `File is too large (max ${formatUploadMax(maxBytes)})`;
}

export function isOverUploadLimit(size, maxBytes) {
  const n = Number(size);
  return !(n >= 0) || n > Number(maxBytes);
}

export function assertUploadSize(size, maxBytes) {
  if (isOverUploadLimit(size, maxBytes)) throw new Error(uploadTooLargeMessage(maxBytes));
}

export function isPayloadTooLargeError(err) {
  if (err == null) return false;
  const status = Number(err.statusCode ?? err.status ?? err.status_code ?? err.httpStatus);
  if (status === 413) return true;
  const code = String(err.code ?? '');
  if (code === '413' || /payload.?too.?large|entity.?too.?large/i.test(code)) return true;
  const msg = String(err.message ?? err.error ?? err.error_description ?? err.msg ?? (typeof err === 'string' ? err : ''));
  return /(?:^|\b)413\b|payload too large|entity too large|object exceeded|maximum allowed size|file size (?:limit|exceed)|exceeded the (?:maximum )?allowed(?: file)? size|the object exceeded|body exceeded/i.test(msg);
}

export function mapUploadError(err, maxBytes) {
  if (isPayloadTooLargeError(err)) return uploadTooLargeMessage(maxBytes);
  if (err && typeof err === 'object' && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return 'The upload failed.';
}
