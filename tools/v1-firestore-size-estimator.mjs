/**
 * Approximate Firestore Standard document storage size estimator.
 * Based on public docs: path + UTF-8 fields + overhead. Not official wire size.
 * Always fails closed for import authorization.
 */
export function estimateStorageSize(docPath, data) {
  if (typeof docPath !== 'string' || !data || typeof data !== 'object') return null;
  let size = 32; // base overhead
  size += Buffer.byteLength(docPath, 'utf8') + 1;
  function walk(obj, depth = 0) {
    if (depth > 20) return false;
    if (Array.isArray(obj)) {
      size += 1;
      for (const item of obj) if (!walk(item, depth + 1)) return false;
      return true;
    }
    if (obj && typeof obj === 'object') {
      size += 1;
      for (const [k, v] of Object.entries(obj)) {
        size += Buffer.byteLength(k, 'utf8') + 1;
        if (!walk(v, depth + 1)) return false;
      }
      return true;
    }
    if (typeof obj === 'string') size += Buffer.byteLength(obj, 'utf8') + 1;
    else if (typeof obj === 'number') size += 8;
    else if (typeof obj === 'boolean') size += 1;
    else return false;
    return true;
  }
  if (!walk(data)) return null;
  return size;
}

export function sizeGate(source, keyedDocs) {
  const sourceSize = estimateStorageSize('flottaSharedState/current', source);
  if (sourceSize === null || sourceSize > 900000) return {ok: false, reason: 'SOURCE_SIZE_OR_INVALID'};
  for (const [path, data] of Object.entries(keyedDocs)) {
    const s = estimateStorageSize(path, data);
    if (s === null || s > 900000) return {ok: false, reason: 'KEYED_SIZE_OR_INVALID', path};
  }
  return {ok: true, sourceSize, firestoreEncodedSizeVerified: false, authorizedForImport: false};
}
