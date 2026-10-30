/**
 * Staging-only import guard.
 * No Firebase access. Reject incomplete and duplicate rows before any write.
 */
export function readNonNegativeCount(value, field) {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 0 && value <= 10000000) return value;
    throw Error(field + ': csak nemnegatív egész szám fogadható el.');
  }
  const s = String(value ?? '').trim();
  const v = /^\d{1,3}(?:[ \u00a0]\d{3})+$/.test(s) ? s.replace(/[ \u00a0]/g,'') : s;
  if (!/^\d+$/.test(v)) throw Error(field + ': hiányzó vagy érvénytelen csomagszám.');
  const num = Number(v);
  if (!Number.isSafeInteger(num) || num > 10000000) throw Error(field + ': túl nagy vagy hibás csomagszám.');
  return num;
}
export function buildImportPlan(rows, mapper) {
  if (!Array.isArray(rows) || !rows.length) throw Error('A fájlban nincs feldolgozható sor.');
  if (rows.length > 5000) throw Error('Egy alkalommal legfeljebb 5000 sor dolgozható fel.');
  const records=[], errors=[], seen=new Map();
  for (let i=0;i<rows.length;i++) {
    const line=i+2; // Excel header is first row
    try {
      const record=mapper(rows[i],i);
      if (!record || !record.col || !record.id || !record.data || typeof record.data !== 'object') {
        throw Error('Hiányzó kötelező mező vagy nem értelmezhető sor.');
      }
      const key=record.col+'/'+record.id;
      if (seen.has(key)) {
        throw Error('Ismétlődő rekordazonosító: a(z) '+seen.get(key)+'. adatsorral egyezik.');
      }
      seen.set(key,line);
      records.push(record);
    } catch(err) {
      errors.push({line,message:String(err?.message||err)});
    }
  }
  return {records,errors,total:rows.length,accepted:records.length,invalid:errors.length,canCommit:errors.length===0 && records.length===rows.length};
}
export function formatImportErrors(plan,limit=5) {
  if(plan.canCommit)return '';
  const details=plan.errors.slice(0,limit).map(e=>'Sor '+e.line+': '+e.message).join(' | ');
  return 'Az import megszakadt: '+plan.invalid+' hibás/ütköző sor a(z) '+plan.total+' adatsorból. '+details+(plan.invalid>limit?' | …':'');
}
