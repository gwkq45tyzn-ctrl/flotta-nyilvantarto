// Size the actual pending set from the pinned Firebase JS SDK without committing it.
// The Firestore v1 Document schema limits the encoded message to 1 MiB minus 4.
// https://github.com/googleapis/googleapis/blob/master/google/firestore/v1/document.proto
import {doc, writeBatch} from 'firebase/firestore';
import firestoreProto from '@google-cloud/firestore-api/protos';

const {Document} = firestoreProto.google.firestore.v1;
export const MAX_DOCUMENT_PROTO_BYTES = 1024 * 1024 - 4;

export function measureDocumentSet(db, path, data) {
  const reference = doc(db, path);
  const batch = writeBatch(db);
  batch.set(reference, data);
  // Firebase does not expose the parsed set publicly. Pin the SDK in the
  // lockfile and refuse evidence if its representation changes.
  const mutation = batch._mutations?.[0];
  const database = reference.firestore._databaseId;
  const fields = mutation?.value?.value?.mapValue?.fields;
  if (batch._mutations?.length !== 1 || mutation?.type !== 0 ||
      mutation.key.path.canonicalString() !== reference.path ||
      mutation.fieldTransforms?.length !== 0 || !fields ||
      !database?.projectId || !database.database) {
    throw Error('UNSUPPORTED_FIREBASE_SET_ENCODING');
  }
  const name = 'projects/' + database.projectId + '/databases/' +
    database.database + '/documents/' + reference.path;
  const message = Document.fromObject({name, fields});
  const bytes = Document.encode(message).finish().byteLength;
  if (bytes > MAX_DOCUMENT_PROTO_BYTES) {
    throw Error('FIRESTORE_DOCUMENT_PROTO_LIMIT: ' + path + ' (' + bytes + ' bytes)');
  }
  return bytes;
}
