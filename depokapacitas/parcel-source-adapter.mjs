/**
 * Source-specific parcel adapter contract (STAGING ONLY).
 *
 * No default column aliases or identity assumptions: the actual export owner
 * must approve a versioned mapping before any real source can be interpreted.
 * Never writes to Firestore/Sheets; the output is NOT an import authorization.
 */
const REQUIRED=['date','trackingId','district','kind'];
const has=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const isValidDate=value=>{
  if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T12:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
};
const allowedMode=new Set(['exact','uppercase']);
const allowedWhitespace=new Set(['preserve','trim']);
const normalize=(value,mode,whitespace)=>{
  const text=whitespace==='trim'?value.trim():value;
  return mode==='uppercase'?text.toUpperCase():text;
};
function mappingProblem(config,headerNames){
  if(!config||typeof config!=='object'||Array.isArray(config))return 'mapping_missing';
  if(typeof config.sourceSchemaId!=='string'||!/^[A-Za-z0-9_-]{3,80}$/.test(config.sourceSchemaId))
    return 'source_schema_id_missing';
  const columns=config.columns;
  if(!columns||typeof columns!=='object'||Array.isArray(columns)||
    Object.keys(columns).length!==REQUIRED.length||
    !REQUIRED.every(k=>has(columns,k)&&typeof columns[k]==='string'&&columns[k].length>0))
    return 'column_mapping_incomplete';
  if(new Set(REQUIRED.map(k=>columns[k])).size!==4)return 'column_mapping_collision';
  if(!REQUIRED.every(k=>headerNames.includes(columns[k])))return 'source_header_not_matched';
  const k=config.kindValues;
  if(!k||typeof k!=='object'||Array.isArray(k)||Object.keys(k).length!==2||
    !has(k,'new')||!has(k,'retry')||
    !Array.isArray(k.new)||!Array.isArray(k.retry)||
    !k.new.length||!k.retry.length)return 'kind_mapping_incomplete';
  const kinds=[...k.new,...k.retry];
  if(kinds.some(v=>typeof v!=='string'||!v.length||v.length>100)||
    new Set(kinds).size!==kinds.length)return 'kind_mapping_ambiguous';
  if(!allowedMode.has(config.identityMode)||!allowedMode.has(config.districtMode)||
    !allowedWhitespace.has(config.identityWhitespace))return 'identity_policy_unconfirmed';
  return '';
}

/**
 * Explicit mapping example:
 * {sourceSchemaId:'SYNTHETIC_QA_V1',
 *  columns:{date:'WorkDay',trackingId:'AWBText',district:'Zone',kind:'ParcelType'},
 *  kindValues:{new:['NEW'],retry:['RETRY']},
 *  identityMode:'exact',identityWhitespace:'preserve',districtMode:'exact'}
 *
 * Input must already be a decoded table of *text* cells. A numeric tracking ID
 * is rejected, not stringified, to retain significant leading zeros.
 */
export function adaptParcelSource(rows,{config=null,availableHeaders=null,selectedDate=null}={}){
  const result={status:'blocked',importAllowed:false,sourceSchemaId:config?.sourceSchemaId||null,
    canonicalRows:[],uniqueCount:null,duplicates:0,excludedRows:0,
    districts:[],issues:[]};
  const issue=(reason,line=null,relatedLine=null)=>
    result.issues.push({reason,line,relatedLine});
  if(!Array.isArray(rows)||rows.length>5000){issue('invalid_or_oversized_input');return result;}
  if(selectedDate!==null&&!isValidDate(selectedDate)){issue('invalid_selected_day');return result;}
  const headerNames=Array.isArray(availableHeaders)
    ?availableHeaders
    :rows.length&&rows[0]&&typeof rows[0]==='object'&&!Array.isArray(rows[0])
      ?Object.keys(rows[0]):[];
  if(!Array.isArray(headerNames)||headerNames.some(v=>typeof v!=='string')||
    new Set(headerNames).size!==headerNames.length){issue('invalid_source_headers');return result;}
  const problem=mappingProblem(config,headerNames);
  if(problem){issue(problem);return result;}
  if(!rows.length){result.status='missing';issue('no_rows');return result;}
  const mapped=[],unique=new Map();
  const codebook=new Map([...config.kindValues.new.map(x=>[x,'new']),
    ...config.kindValues.retry.map(x=>[x,'retry'])]);
  for(let i=0;i<rows.length;i++){
    const row=rows[i],line=i+2;
    if(!row||typeof row!=='object'||Array.isArray(row)||
      !REQUIRED.every(k=>has(row,config.columns[k]))){issue('required_source_cell_missing',line);continue;}
    const fields=REQUIRED.map(k=>row[config.columns[k]]);
    if(fields.some(v=>typeof v!=='string')){issue('non_text_source_cell',line);continue;}
    const date=fields[0].trim();
    const trackingId=normalize(fields[1],config.identityMode,config.identityWhitespace);
    const district=normalize(fields[2].trim(),config.districtMode,'preserve');
    const kind=codebook.get(fields[3]);
    if(!isValidDate(date)||!trackingId||trackingId.length>100||
      /[\u0000-\u0020\u007f]/.test(trackingId)||
      !district||district.length>60||!kind){
      issue('invalid_mapped_value',line);continue;
    }
    if(selectedDate!==null&&date!==selectedDate){result.excludedRows++;continue;}
    const record={date,trackingId,district,kind};
    mapped.push(record);
    const k=JSON.stringify([date,trackingId]);
    if(!unique.has(k)){unique.set(k,{record,line});continue;}
    const previous=unique.get(k);
    if(previous.record.district!==district||previous.record.kind!==kind)
      issue('conflicting_tracking_identity',line,previous.line);
    else result.duplicates++;
  }
  if(result.issues.length)return result;
  if(!mapped.length){result.status='missing';issue('no_selected_day_rows');return result;}
  const counts=new Map();
  for(const {record} of unique.values()){
    if(!counts.has(record.district))
      counts.set(record.district,{district:record.district,newCount:0,retryCount:0});
    counts.get(record.district)[record.kind==='new'?'newCount':'retryCount']++;
  }
  // The caller may preview these values only; this module has no commit path.
  result.status='preview';
  result.canonicalRows=[...unique.values()].map(x=>({...x.record}));
  result.uniqueCount=unique.size;
  result.districts=[...counts.values()].sort((a,b)=>a.district.localeCompare(b.district,'hu'));
  return result;
}
