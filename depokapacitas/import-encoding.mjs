/** CSV text decoding before SheetJS: UTF-8 first, legacy Hungarian CSV fallback. */
export function decodeCsv(buffer){
 const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
 if(bytes[0]===0xff&&bytes[1]===0xfe)return new TextDecoder('utf-16le',{fatal:true}).decode(bytes);
 if(bytes[0]===0xfe&&bytes[1]===0xff)return new TextDecoder('utf-16be',{fatal:true}).decode(bytes);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch{return new TextDecoder('windows-1250').decode(bytes);}
}
