/** Preserve worksheet row addresses, including <row> records omitted by XLSX.
 * Header is row1; diagnostics use array index+1. Never compact blank rows.
 */
export function completePhysicalExcelRows(rows){
 if(!Array.isArray(rows)||!rows.length||!Array.isArray(rows[0]))throw Error('Üres Excel-export.');
 return Array.from(rows,row=>row??[]);
}
