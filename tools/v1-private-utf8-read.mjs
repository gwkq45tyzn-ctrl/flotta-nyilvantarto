/**
 * Local-only PRIVATE UTF-8 file read. Keep owner names/IDs/source bytes out of
 * error messages. Protects the original Fleet export, Google Apps Script
 * redacted inventory and offline Firestore protobuf proof from symlink path
 * swaps, non-file inputs, changed file sizes and lossy text decoding.
 * NEVER writes, stores, logs, uploads or opens a network connection.
 */
import {
  lstatSync,openSync,fstatSync,readFileSync,closeSync,constants
} from 'node:fs';
import {TextDecoder} from 'node:util';
const deny=(code)=>{const e=new Error(code);e.code=code;return e;};

/**
 * Synchronous, bounded, read-only local file. The opened descriptor must
 * still refer to the exact original lstat inode; no pathname reload.
 * Fatal UTF-8 means corrupt bytes cannot silently turn into a valid JSON
 * string with U+FFFD replacement characters and a misleading source hash.
 */
export function readStrictPrivateUtf8File(path,maxBytes){
  if(typeof path!=='string'||!path||
     !Number.isSafeInteger(maxBytes)||maxBytes<1)
    throw deny('PRIVATE_FILE_INVALID_ARGUMENTS');
  let meta,fd;
  try{
    meta=lstatSync(path);
    if(!meta.isFile()||meta.isSymbolicLink())
      throw deny('PRIVATE_FILE_NOT_REGULAR');
    if(!Number.isSafeInteger(meta.size)||meta.size<1||meta.size>maxBytes)
      throw deny('PRIVATE_FILE_SIZE_DENIED');
    // O_NOFOLLOW is supported on Linux/macOS; lstat/fstat parity also
    // stops path-to-symlink and path-to-inode swaps without following data.
    fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
    const actual=fstatSync(fd);
    if(!actual.isFile()||actual.isSymbolicLink?.()||
       !Number.isSafeInteger(actual.size)||actual.size!==meta.size||
       actual.ino!==meta.ino||actual.dev!==meta.dev||
       actual.size>maxBytes)
      throw deny('PRIVATE_FILE_CHANGED_DURING_READ');
    const bytes=readFileSync(fd);
    if(bytes.length!==actual.size||bytes.length<1||bytes.length>maxBytes)
      throw deny('PRIVATE_FILE_CHANGED_DURING_READ');
    return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  }catch(e){
    if(e?.code==='PRIVATE_FILE_SIZE_DENIED')throw e;
    if(e?.code==='PRIVATE_FILE_INVALID_ARGUMENTS')throw e;
    if(e?.code==='PRIVATE_FILE_NOT_REGULAR')throw e;
    if(e?.code==='PRIVATE_FILE_CHANGED_DURING_READ')throw e;
    throw deny('PRIVATE_FILE_UNREADABLE_OR_BAD_UTF8');
  }finally{
    if(fd!==undefined)try{closeSync(fd)}catch{}
  }
}
