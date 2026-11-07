/* Untrusted issue evidence. Storage is not analysis, and a file is not permission to deploy, delete, or send. */
export const MAX_CONTEXT_FILES = 6;
export const ANALYSIS_STATE = 'stored_not_analyzed';
const AUDIO_MS = 180000;
const VIDEO_MS = 120000;

const RULES = {
  png: { mime: 'image/png', max: 5000000, kind: 'image' },
  jpg: { mime: 'image/jpeg', max: 5000000, kind: 'image' },
  jpeg: { mime: 'image/jpeg', max: 5000000, kind: 'image' },
  webp: { mime: 'image/webp', max: 5000000, kind: 'image' },
  gif: { mime: 'image/gif', max: 5000000, kind: 'image' },
  pdf: { mime: 'application/pdf', max: 10000000, kind: 'pdf' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', max: 10000000, kind: 'docx' },
  txt: { mime: 'text/plain', max: 1000000, kind: 'text' },
  mp3: { mime: 'audio/mpeg', max: 15000000, kind: 'audio', maxMs: AUDIO_MS },
  m4a: { mime: 'audio/mp4', max: 15000000, kind: 'audio', maxMs: AUDIO_MS },
  wav: { mime: 'audio/wav', max: 15000000, kind: 'audio', maxMs: AUDIO_MS },
  mp4: { mime: 'video/mp4', max: 25000000, kind: 'video', maxMs: VIDEO_MS },
  webm: { mime: 'video/webm', max: 25000000, kind: 'video', maxMs: VIDEO_MS },
};

const starts = (bytes, sig) => sig.every((b, i) => bytes[i] === b);
const ascii = (bytes, n) => String.fromCharCode(...bytes.slice(0, n));

function magicOk(ext, bytes) {
  if (!bytes || !bytes.length) return ext === 'txt';
  if (starts(bytes, [0x4d, 0x5a]) || starts(bytes, [0x7f, 0x45, 0x4c, 0x46])) return false;
  if (ext === 'png') return starts(bytes, [0x89, 0x50, 0x4e, 0x47]);
  if (ext === 'jpg' || ext === 'jpeg') return starts(bytes, [0xff, 0xd8, 0xff]);
  if (ext === 'gif') return ascii(bytes, 4) === 'GIF8';
  if (ext === 'webp') return ascii(bytes, 4) === 'RIFF' && ascii(bytes.slice(8), 4) === 'WEBP';
  if (ext === 'pdf') return ascii(bytes, 4) === '%PDF';
  if (ext === 'docx') return starts(bytes, [0x50, 0x4b, 0x03, 0x04]);
  if (ext === 'mp3') return ascii(bytes, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (ext === 'wav') return ascii(bytes, 4) === 'RIFF' && ascii(bytes.slice(8), 4) === 'WAVE';
  if (ext === 'm4a' || ext === 'mp4') return ascii(bytes.slice(4), 4) === 'ftyp';
  if (ext === 'webm') return starts(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  if (ext === 'txt') return !bytes.includes(0) && ascii(bytes, 2) !== '<!' && ascii(bytes, 5).toLowerCase() !== '<html';
  return false;
}

export function supportedTypesText() {
  return 'PNG, JPEG, WEBP, or GIF up to 5 MB. PDF or DOCX up to 10 MB. Plain text up to 1 MB. MP3, M4A, or WAV up to 15 MB and 3 minutes. MP4 or WebM up to 25 MB and 2 minutes. Up to six files. The chooser list is not a check.';
}

export function inspectUpload(file = {}) {
  const name = String(file.name || '');
  if (file.webkitRelativePath) throw new Error('Choose one file. Folder upload is not available.');
  const ext = (name.split('.').pop() || '').toLowerCase();
  const rule = RULES[ext];
  if (!rule) throw new Error('That file type is not accepted.');
  const mime = String(file.mimeType || file.type || '').toLowerCase();
  if (mime && mime !== rule.mime) throw new Error('The file type does not match its extension.');
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0 || size > rule.max) throw new Error('That file is empty or larger than the limit for its type.');
  const bytes = file.bytes instanceof Uint8Array ? file.bytes : null;
  if (!bytes || !bytes.length) throw new Error('The file type was not checked. It was not saved.');
  if (!magicOk(ext, bytes)) throw new Error('The file contents do not match its extension. It was not saved.');
  if (rule.kind === 'audio' || rule.kind === 'video') {
    const ms = Number(file.durationMs);
    if (!Number.isFinite(ms) || ms <= 0 || ms > rule.maxMs) throw new Error('Could not confirm the length, or it is longer than the limit. It was not saved.');
  }
  return {
    ext, mime: rule.mime, size, kind: rule.kind, name: name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120),
    durationMs: rule.maxMs ? Math.round(Number(file.durationMs)) : null,
    analysisState: ANALYSIS_STATE, trusted: false,
  };
}

export function uploadProgress(loaded, total) {
  const t = Number(total);
  if (!t || t < 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(loaded) / t) * 100)));
}

export function trackUpload({ loaded = 0, total = 0, aborted = false } = {}) {
  const progress = uploadProgress(loaded, total);
  if (aborted) return { status: 'cancelled', progress };
  if (total > 0 && loaded >= total) return { status: 'complete', progress: 100 };
  return { status: 'uploading', progress };
}

export function readWithProgress(file, readerFactory, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(new Error('Upload cancelled. Nothing was saved.')); return; }
    const reader = readerFactory();
    const stop = () => { try { reader.abort(); } catch (e) { /* already finished */ } reject(new Error('Upload cancelled. Nothing was saved.')); };
    if (signal) signal.addEventListener('abort', stop, { once: true });
    reader.onprogress = (e) => { if (onProgress) onProgress(trackUpload({ loaded: e.loaded, total: e.total || file.size })); };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => { if (signal) signal.removeEventListener('abort', stop); resolve(reader.result); };
    reader.readAsArrayBuffer(file);
  });
}
